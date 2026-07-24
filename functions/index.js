"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineJsonSecret, defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

admin.initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = admin.firestore();
const OWNER_EMAIL = "sultan.dbohtes@gmail.com";
const SESSION_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
const ALLOWED_ORIGINS = [
  "https://dbohtess.github.io",
  "https://sultan-art-gallery-2026.web.app",
  "https://sultan-art-gallery-2026.firebaseapp.com",
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
];
const cloudinaryConfig = defineJsonSecret("CLOUDINARY_CONFIG");
const pinPepper = defineSecret("PRIVATE_SECTION_PIN_PEPPER");

function configureCloudinary() {
  const config = cloudinaryConfig.value();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
  return config;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function validId(value) {
  return /^[A-Za-z0-9_-]{1,160}$/.test(String(value || ""));
}

function validCode(value) {
  return /^\d{6}$/.test(String(value || ""));
}

function pinMaterial(sectionId, code) {
  return `${sectionId}:${code}:${pinPepper.value()}`;
}

function clientIp(request) {
  return String(request.ip || request.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim();
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function decodedUser(request) {
  const header = String(request.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  try {
    return await admin.auth().verifyIdToken(header.slice(7));
  } catch {
    return null;
  }
}

function isOwner(user) {
  return Boolean(
    user &&
      user.email === OWNER_EMAIL &&
      user.email_verified === true,
  );
}

async function requireOwner(request) {
  const user = await decodedUser(request);
  if (!isOwner(user)) {
    const error = new Error("Owner sign-in is required.");
    error.status = 403;
    error.code = "owner-required";
    throw error;
  }
  return user;
}

function publicSectionCard(section, id) {
  return {
    id,
    recordKind: "section",
    name: cleanText(section.name, 60),
    slug: cleanText(section.slug, 100),
    description: cleanText(section.description, 300),
    cover: cleanText(section.cover, 500),
    order: Number.isFinite(Number(section.order)) ? Number(section.order) : 0,
    privacy: section.privacy === "private" ? "private" : "public",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function privateMediaRecord(item, sectionSlug, id) {
  const type = item.type === "video" ? "video" : "image";
  return {
    id,
    recordKind: "media",
    type,
    title: cleanText(item.title, 100),
    description: cleanText(item.description, 500),
    year: cleanText(item.year, 4),
    collection: sectionSlug,
    publicId: cleanText(item.publicId, 500),
    format: cleanText(item.format || extensionFromUrl(item.url), 20),
    deliveryType: "authenticated",
    featured: Boolean(item.featured && type === "image"),
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    orientation: ["portrait", "landscape", "square", "tall"].includes(
      item.orientation,
    )
      ? item.orientation
      : "portrait",
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : 0,
    createdAt: cleanText(item.createdAt, 50) || new Date().toISOString(),
    source: "cloudinary",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function extensionFromUrl(url) {
  const match = String(url || "").match(/\.([a-z0-9]{2,10})(?:[?#]|$)/i);
  return match ? match[1].toLowerCase() : "";
}

async function checkRateLimit(request, sectionId) {
  const key = hashValue(`${sectionId}:${clientIp(request)}`);
  const ref = db.collection("_privateRateLimits").doc(key);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { ref, key };
  const value = snapshot.data();
  const lockedUntil = value.lockedUntil?.toMillis?.() || 0;
  if (lockedUntil > Date.now()) {
    const error = new Error("Too many attempts. Please wait before trying again.");
    error.status = 429;
    error.code = "rate-limited";
    error.retryAfter = Math.ceil((lockedUntil - Date.now()) / 1000);
    throw error;
  }
  return { ref, key };
}

async function recordFailedAttempt(ref, sectionId) {
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const value = snapshot.exists ? snapshot.data() : {};
    const windowStarted = value.windowStarted?.toMillis?.() || 0;
    const withinWindow = now - windowStarted < ATTEMPT_WINDOW_MS;
    const attempts = (withinWindow ? Number(value.attempts) || 0 : 0) + 1;
    transaction.set(
      ref,
      {
        sectionId,
        attempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
        windowStarted: admin.firestore.Timestamp.fromMillis(
          withinWindow ? windowStarted : now,
        ),
        lockedUntil:
          attempts >= MAX_ATTEMPTS
            ? admin.firestore.Timestamp.fromMillis(now + LOCK_MS)
            : admin.firestore.Timestamp.fromMillis(0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

async function validateSession(sectionId, rawToken) {
  if (!rawToken || rawToken.length > 200) return false;
  const ref = db.collection("_privateAccess").doc(hashValue(rawToken));
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  const value = snapshot.data();
  const valid =
    value.sectionId === sectionId &&
    (value.expiresAt?.toMillis?.() || 0) > Date.now();
  if (!valid) await ref.delete().catch(() => {});
  return valid;
}

async function issueSession(sectionId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    Date.now() + SESSION_MINUTES * 60 * 1000,
  );
  await db.collection("_privateAccess").doc(hashValue(token)).set({
    sectionId,
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { token, expiresAt };
}

async function revokeSessions(sectionId) {
  const snapshot = await db
    .collection("_privateAccess")
    .where("sectionId", "==", sectionId)
    .get();
  if (snapshot.empty) return;
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

async function authorizePrivateSection(request, body, sectionId, sectionData) {
  const user = await decodedUser(request);
  if (isOwner(user)) return;
  if (await validateSession(sectionId, cleanText(body.sessionToken, 200))) return;
  if (!validCode(body.accessCode)) {
    const error = new Error("Enter a valid 6-digit access code.");
    error.status = 401;
    error.code = "invalid-code";
    throw error;
  }
  const { ref } = await checkRateLimit(request, sectionId);
  const correct = await bcrypt.compare(
    pinMaterial(sectionId, body.accessCode),
    sectionData.pinHash || "",
  );
  if (!correct) {
    await recordFailedAttempt(ref, sectionId);
    const error = new Error("Incorrect access code.");
    error.status = 401;
    error.code = "invalid-code";
    throw error;
  }
  await ref.delete().catch(() => {});
}

function configurePrivateDownload(item, expiresAtSeconds) {
  const type = item.type === "video" ? "video" : "image";
  const format = item.format || (type === "video" ? "mp4" : "jpg");
  return cloudinary.utils.private_download_url(item.publicId, format, {
    resource_type: type,
    type: "authenticated",
    expires_at: expiresAtSeconds,
    attachment: false,
  });
}

async function getSection(request, body) {
  const sectionId = cleanText(body.sectionId, 160);
  if (!validId(sectionId)) {
    const error = new Error("Invalid private section.");
    error.status = 400;
    error.code = "invalid-section";
    throw error;
  }
  configureCloudinary();
  const sectionRef = db.collection("privateSections").doc(sectionId);
  const sectionSnapshot = await sectionRef.get();
  if (!sectionSnapshot.exists) {
    const error = new Error("Private section not found.");
    error.status = 404;
    error.code = "section-not-found";
    throw error;
  }
  const sectionData = sectionSnapshot.data();
  await authorizePrivateSection(request, body, sectionId, sectionData);
  const session = await issueSession(sectionId);
  const expiresAtSeconds = Math.floor(session.expiresAt.toMillis() / 1000);
  const mediaSnapshot = await sectionRef
    .collection("media")
    .orderBy("order")
    .get();
  const items = mediaSnapshot.docs.map((document) => {
    const value = document.data();
    return {
      id: document.id,
      type: value.type === "video" ? "video" : "image",
      title: cleanText(value.title, 100),
      description: cleanText(value.description, 500),
      year: cleanText(value.year, 4),
      collection: sectionData.slug,
      format: value.format,
      featured: Boolean(value.featured),
      width: Number(value.width) || 0,
      height: Number(value.height) || 0,
      orientation: value.orientation || "portrait",
      order: Number(value.order) || 0,
      createdAt: value.createdAt || "",
      source: "cloudinary",
      url: configurePrivateDownload(value, expiresAtSeconds),
      thumbnail:
        value.type === "video"
          ? ""
          : configurePrivateDownload(value, expiresAtSeconds),
    };
  });
  return {
    items,
    sessionToken: session.token,
    expiresAt: session.expiresAt.toDate().toISOString(),
  };
}

async function renameAsset(item, fromType, toType) {
  if (!item.publicId || item.source !== "cloudinary") {
    throw new Error(
      "Every item must be a Cloudinary upload before this section can change privacy.",
    );
  }
  configureCloudinary();
  return cloudinary.uploader.rename(item.publicId, item.publicId, {
    resource_type: item.type === "video" ? "video" : "image",
    type: fromType,
    to_type: toType,
    overwrite: true,
    invalidate: true,
  });
}

async function saveSection(request, body) {
  await requireOwner(request);
  const section = body.section || {};
  const id = cleanText(section.id, 160);
  if (!validId(id)) throw Object.assign(new Error("Invalid section ID."), { status: 400 });
  const card = publicSectionCard(section, id);
  if (!card.name || !card.slug)
    throw Object.assign(new Error("Section name and slug are required."), { status: 400 });

  const cardRef = db.collection("media").doc(id);
  const privateRef = db.collection("privateSections").doc(id);
  const [oldCardSnapshot, oldPrivateSnapshot] = await Promise.all([
    cardRef.get(),
    privateRef.get(),
  ]);
  const oldCard = oldCardSnapshot.exists ? oldCardSnapshot.data() : null;
  const wasPrivate = oldCard?.privacy === "private" || oldPrivateSnapshot.exists;
  const willBePrivate = card.privacy === "private";
  const accessCode = cleanText(body.accessCode, 6);

  if (willBePrivate && !wasPrivate && !validCode(accessCode))
    throw Object.assign(new Error("Choose exactly six numeric digits."), {
      status: 400,
      code: "invalid-code",
    });
  if (accessCode && !validCode(accessCode))
    throw Object.assign(new Error("The access code must contain exactly six digits."), {
      status: 400,
      code: "invalid-code",
    });

  let pinHash = oldPrivateSnapshot.data()?.pinHash || "";
  if (accessCode)
    pinHash = await bcrypt.hash(pinMaterial(id, accessCode), 12);

  if (!wasPrivate && willBePrivate) {
    const publicMedia = await db
      .collection("media")
      .where("collection", "==", card.slug)
      .get();
    const records = publicMedia.docs
      .map((document) => ({ id: document.id, ...document.data() }))
      .filter((item) => !item.recordKind || item.recordKind === "media");
    if (records.length > 440)
      throw Object.assign(
        new Error("This section is too large to change privacy in one operation."),
        { status: 409, code: "section-too-large" },
      );
    records.forEach((item) => {
      if (!item.publicId || item.source !== "cloudinary")
        throw Object.assign(
          new Error(
            "This section contains an item that is not a Cloudinary upload. Remove it before making the section private.",
          ),
          { status: 409, code: "unprotected-media" },
        );
    });
    const converted = [];
    try {
      for (const item of records) {
        await renameAsset(item, "upload", "authenticated");
        converted.push(item);
      }
    } catch (error) {
      for (const item of converted.reverse())
        await renameAsset(item, "authenticated", "upload").catch(() => {});
      throw error;
    }
    const batch = db.batch();
    records.forEach((item) => {
      batch.set(
        privateRef.collection("media").doc(item.id),
        privateMediaRecord(item, card.slug, item.id),
      );
      batch.delete(db.collection("media").doc(item.id));
    });
    batch.set(privateRef, {
      slug: card.slug,
      pinHash,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(cardRef, card);
    try {
      await batch.commit();
    } catch (error) {
      for (const item of converted.reverse())
        await renameAsset(item, "authenticated", "upload").catch(() => {});
      throw error;
    }
    await revokeSessions(id).catch(() => {});
    return { id };
  }

  if (wasPrivate && !willBePrivate) {
    const privateMedia = await privateRef.collection("media").get();
    const records = privateMedia.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));
    if (records.length > 440)
      throw Object.assign(
        new Error("This section is too large to change privacy in one operation."),
        { status: 409, code: "section-too-large" },
      );
    const converted = [];
    try {
      for (const item of records) {
        const result = await renameAsset(item, "authenticated", "upload");
        converted.push({ item, result });
      }
    } catch (error) {
      for (const { item } of converted.reverse())
        await renameAsset(item, "upload", "authenticated").catch(() => {});
      throw error;
    }
    const batch = db.batch();
    converted.forEach(({ item, result }) => {
      batch.set(db.collection("media").doc(item.id), {
        ...item,
        collection: card.slug,
        deliveryType: "upload",
        url: result.secure_url,
        thumbnail: "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.delete(privateRef.collection("media").doc(item.id));
    });
    batch.delete(privateRef);
    batch.set(cardRef, card);
    try {
      await batch.commit();
    } catch (error) {
      for (const { item } of converted.reverse())
        await renameAsset(item, "upload", "authenticated").catch(() => {});
      throw error;
    }
    await revokeSessions(id).catch(() => {});
    return { id };
  }

  if (willBePrivate) {
    await Promise.all([
      privateRef.set(
        {
          slug: card.slug,
          pinHash,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
      cardRef.set(card, { merge: true }),
    ]);
    if (accessCode) await revokeSessions(id).catch(() => {});
    return { id };
  }

  await cardRef.set(card, { merge: true });
  return { id };
}

async function signUpload(request, body) {
  await requireOwner(request);
  const sectionId = cleanText(body.sectionId, 160);
  if (!validId(sectionId))
    throw Object.assign(new Error("Invalid private section."), { status: 400 });
  const section = await db.collection("privateSections").doc(sectionId).get();
  if (!section.exists)
    throw Object.assign(new Error("Private section not found."), { status: 404 });
  const config = configureCloudinary();
  const timestamp = Math.floor(Date.now() / 1000);
  const parameters = {
    folder: "sultan-art-gallery/private",
    timestamp,
    type: "authenticated",
  };
  return {
    endpoint: `https://api.cloudinary.com/v1_1/${config.cloudName}/${body.kind === "video" ? "video" : "image"}/upload`,
    apiKey: config.apiKey,
    parameters,
    signature: cloudinary.utils.api_sign_request(
      parameters,
      config.apiSecret,
    ),
  };
}

async function saveMedia(request, body) {
  await requireOwner(request);
  const sectionId = cleanText(body.sectionId, 160);
  const item = body.item || {};
  const id = cleanText(item.id, 160);
  if (!validId(sectionId) || !validId(id))
    throw Object.assign(new Error("Invalid media record."), { status: 400 });
  const sectionRef = db.collection("privateSections").doc(sectionId);
  const section = await sectionRef.get();
  if (!section.exists)
    throw Object.assign(new Error("Private section not found."), { status: 404 });
  const existingRef = sectionRef.collection("media").doc(id);
  const existingSnapshot = await existingRef.get();
  const mergedItem = {
    ...(existingSnapshot.exists ? existingSnapshot.data() : {}),
    ...item,
    publicId:
      cleanText(item.publicId, 500) ||
      cleanText(existingSnapshot.data()?.publicId, 500),
    format:
      cleanText(item.format, 20) ||
      cleanText(existingSnapshot.data()?.format, 20),
  };
  if (!mergedItem.publicId)
    throw Object.assign(new Error("A protected Cloudinary upload is required."), {
      status: 400,
      code: "protected-upload-required",
    });
  await existingRef.set(
    privateMediaRecord(mergedItem, section.data().slug, id),
    { merge: true },
  );
  return { id };
}

async function removeMedia(request, body) {
  await requireOwner(request);
  const sectionId = cleanText(body.sectionId, 160);
  const mediaId = cleanText(body.mediaId, 160);
  if (!validId(sectionId) || !validId(mediaId))
    throw Object.assign(new Error("Invalid media record."), { status: 400 });
  await db
    .collection("privateSections")
    .doc(sectionId)
    .collection("media")
    .doc(mediaId)
    .delete();
  return { removed: true };
}

async function reorderMedia(request, body) {
  await requireOwner(request);
  const sectionId = cleanText(body.sectionId, 160);
  const orderedIds = Array.isArray(body.orderedIds)
    ? body.orderedIds.map((value) => cleanText(value, 160))
    : [];
  if (
    !validId(sectionId) ||
    orderedIds.length > 450 ||
    orderedIds.some((id) => !validId(id))
  )
    throw Object.assign(new Error("Invalid media order."), { status: 400 });
  const batch = db.batch();
  orderedIds.forEach((id, order) =>
    batch.update(
      db
        .collection("privateSections")
        .doc(sectionId)
        .collection("media")
        .doc(id),
      { order },
    ),
  );
  await batch.commit();
  return { reordered: true };
}

async function removeSection(request, body) {
  await requireOwner(request);
  const sectionId = cleanText(body.sectionId, 160);
  if (!validId(sectionId))
    throw Object.assign(new Error("Invalid private section."), { status: 400 });
  const privateRef = db.collection("privateSections").doc(sectionId);
  const media = await privateRef.collection("media").get();
  const batch = db.batch();
  media.docs.forEach((document) => batch.delete(document.ref));
  batch.delete(privateRef);
  batch.delete(db.collection("media").doc(sectionId));
  await batch.commit();
  await revokeSessions(sectionId).catch(() => {});
  return { removed: true };
}

function sendError(response, error) {
  console.error(error);
  response.status(error.status || 500).json({
    code: error.code || "private-service-error",
    message:
      error.status && error.status < 500
        ? error.message
        : "The secure private-section service could not complete the request.",
    retryAfter: error.retryAfter || 0,
  });
}

exports.privateSectionApi = onRequest(
  {
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [cloudinaryConfig, pinPepper],
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({ message: "Method not allowed." });
      return;
    }
    const body = request.body || {};
    try {
      let result;
      switch (body.action) {
        case "getSection":
          result = await getSection(request, body);
          break;
        case "saveSection":
          result = await saveSection(request, body);
          break;
        case "signUpload":
          result = await signUpload(request, body);
          break;
        case "saveMedia":
          result = await saveMedia(request, body);
          break;
        case "removeMedia":
          result = await removeMedia(request, body);
          break;
        case "reorderMedia":
          result = await reorderMedia(request, body);
          break;
        case "removeSection":
          result = await removeSection(request, body);
          break;
        default:
          throw Object.assign(new Error("Unknown private-section action."), {
            status: 400,
            code: "unknown-action",
          });
      }
      response.set("Cache-Control", "no-store");
      response.status(200).json(result);
    } catch (error) {
      sendError(response, error);
    }
  },
);
