import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const baseUrl = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1`;
const bucketId = env.SUPABASE_STORAGE_BUCKET;
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  "content-type": "application/json"
};
if (env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")) {
  headers.authorization = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;
}
const configuration = {
  id: bucketId,
  name: bucketId,
  public: false,
  file_size_limit: 10 * 1024 * 1024,
  allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"]
};

async function responseError(response) {
  try {
    const body = await response.clone().json();
    return body.message || body.error || body.statusCode || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

const existingResponse = await fetch(`${baseUrl}/bucket/${encodeURIComponent(bucketId)}`, { headers });
const existingError = existingResponse.ok ? null : await responseError(existingResponse);
if (existingResponse.status === 404 || existingError === "Bucket not found") {
  const createResponse = await fetch(`${baseUrl}/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify(configuration)
  });
  if (!createResponse.ok) throw new Error(`Création du bucket refusée (${createResponse.status}).`);
} else if (existingResponse.ok) {
  const existing = await existingResponse.json();
  const needsUpdate =
    existing.public !== false ||
    Number(existing.file_size_limit) !== configuration.file_size_limit ||
    JSON.stringify([...(existing.allowed_mime_types || [])].sort()) !== JSON.stringify([...configuration.allowed_mime_types].sort());
  if (needsUpdate) {
    const updateResponse = await fetch(`${baseUrl}/bucket/${encodeURIComponent(bucketId)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(configuration)
    });
    if (!updateResponse.ok) throw new Error(`Mise à jour du bucket refusée (${updateResponse.status}).`);
  }
} else {
  throw new Error(`Vérification du bucket refusée (${existingResponse.status}) : ${existingError}`);
}

const verifyResponse = await fetch(`${baseUrl}/bucket/${encodeURIComponent(bucketId)}`, { headers });
if (!verifyResponse.ok) throw new Error(`Vérification finale du bucket refusée (${verifyResponse.status}).`);
const bucket = await verifyResponse.json();
const objectsResponse = await fetch(`${baseUrl}/object/list/${encodeURIComponent(bucketId)}`, {
  method: "POST",
  headers,
  body: JSON.stringify({ prefix: "", limit: 1, offset: 0 })
});
if (!objectsResponse.ok) throw new Error(`Lecture du bucket refusée (${objectsResponse.status}).`);
const objects = await objectsResponse.json();

console.log(JSON.stringify({
  bucket: bucket.id,
  private: bucket.public === false,
  fileSizeLimit: Number(bucket.file_size_limit),
  allowedMimeTypes: bucket.allowed_mime_types,
  empty: Array.isArray(objects) && objects.length === 0,
  publicPolicyCreated: false,
  uploadedFiles: 0
}, null, 2));
