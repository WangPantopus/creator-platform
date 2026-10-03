#!/usr/bin/env node
// Local development only. No private key is shipped in this repository.
import {
  constants,
  openSync,
  readFileSync,
  closeSync,
  fstatSync,
} from "node:fs";
import { X509Certificate, createPrivateKey, sign } from "node:crypto";
import path from "node:path";

function privateFile(file, limit, secret = false) {
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > limit || (secret && stat.mode & 0o077))
      throw new Error("Invalid development credential file.");
    return readFileSync(descriptor, "utf8");
  } finally {
    closeSync(descriptor);
  }
}

try {
  const directory = process.env.W6_DEV_C2PA_DIRECTORY;
  if (
    process.env.NODE_ENV !== "development" ||
    !directory ||
    !path.isAbsolute(directory)
  )
    throw new Error(
      "The W6 development signer requires explicit development configuration.",
    );
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--signer-info"))
    throw new Error("Unsupported signer operation.");
  const chain = privateFile(path.join(directory, "signing-chain.pem"), 32_768);
  const certificate = new X509Certificate(chain);
  if (
    !certificate.subject.includes(
      "CN=Creator Platform W6 Development Signer",
    ) ||
    certificate.ca
  )
    throw new Error(
      "A labeled development end-entity certificate is required.",
    );
  const key = createPrivateKey(
    privateFile(path.join(directory, "signing-key.pem"), 8192, true),
  );
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1" ||
    !certificate.checkPrivateKey(key)
  )
    throw new Error("The development certificate and P-256 key must match.");
  if (args[0] === "--signer-info") {
    process.stdout.write(JSON.stringify({ alg: "es256", sign_cert: chain }));
  } else {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 65_536)
        throw new Error("Signing input exceeds the development limit.");
      chunks.push(chunk);
    }
    if (!bytes) throw new Error("Signing input is empty.");
    process.stdout.write(
      sign("sha256", Buffer.concat(chunks), { key, dsaEncoding: "ieee-p1363" }),
    );
  }
} catch {
  process.stderr.write(
    "W6 development content-credential signer unavailable.\n",
  );
  process.exitCode = 1;
}
