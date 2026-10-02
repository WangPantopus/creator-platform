#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { createHash, X509Certificate } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Generate an isolated, short-lived private development CA. Never overwrite an
// existing directory, install system trust, or use c2patool's bundled keys.
const args = process.argv.slice(2);
if (
  args.length !== 2 ||
  args[0] !== "--directory" ||
  !path.isAbsolute(args[1]) ||
  /\s/u.test(args[1])
)
  throw new Error(
    "Usage: node infra/local/w6/provision-dev-c2pa.mjs --directory /absolute/private/path-without-spaces",
  );
if (process.env.NODE_ENV !== "development")
  throw new Error("This command requires NODE_ENV=development.");
const directory = path.normalize(args[1]);
mkdirSync(directory, { mode: 0o700 });
process.umask(0o077);
const openssl = (command) =>
  execFileSync("openssl", command, {
    cwd: directory,
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 10_000,
  });
writeFileSync(
  path.join(directory, "root.cnf"),
  `[req]
distinguished_name=dn
prompt=no
x509_extensions=root
[dn]
CN=Creator Platform W6 Development Root - NOT PRODUCTION
O=Local Development Only
[root]
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always
`,
  { mode: 0o600, flag: "wx" },
);
writeFileSync(
  path.join(directory, "signer.cnf"),
  `[req]
distinguished_name=dn
prompt=no
[dn]
CN=Creator Platform W6 Development Signer - NOT PRODUCTION
O=Local Development Only
[signer]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=1.3.6.1.4.1.62558.2.1,emailProtection
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always
`,
  { mode: 0o600, flag: "wx" },
);
openssl([
  "req",
  "-new",
  "-x509",
  "-newkey",
  "ec",
  "-pkeyopt",
  "ec_paramgen_curve:P-256",
  "-nodes",
  "-sha256",
  "-days",
  "30",
  "-config",
  "root.cnf",
  "-keyout",
  "root-key.pem",
  "-out",
  "root.pem",
]);
openssl([
  "req",
  "-new",
  "-newkey",
  "ec",
  "-pkeyopt",
  "ec_paramgen_curve:P-256",
  "-nodes",
  "-sha256",
  "-config",
  "signer.cnf",
  "-keyout",
  "signing-key.pem",
  "-out",
  "signing.csr",
]);
openssl([
  "x509",
  "-req",
  "-in",
  "signing.csr",
  "-CA",
  "root.pem",
  "-CAkey",
  "root-key.pem",
  "-CAcreateserial",
  "-days",
  "7",
  "-sha256",
  "-extfile",
  "signer.cnf",
  "-extensions",
  "signer",
  "-out",
  "signing-chain.pem",
]);
const signer = path.join(directory, "dev-c2pa-signer.mjs");
copyFileSync(
  fileURLToPath(new URL("./dev-c2pa-signer.mjs", import.meta.url)),
  signer,
);
chmodSync(signer, 0o700);
const anchor = readFileSync(path.join(directory, "root.pem"));
const leaf = new X509Certificate(
  readFileSync(path.join(directory, "signing-chain.pem")),
);
const root = new X509Certificate(anchor);
if (leaf.ca || !leaf.verify(root.publicKey))
  throw new Error("Development certificate issuance failed.");
const staging = path.join(directory, "staging");
mkdirSync(staging, { mode: 0o700 });
const configuration = {
  mode: "development-only",
  expiresAt: leaf.validTo,
  W6_DEV_C2PA_DIRECTORY: directory,
  MEDIA_C2PA_SIGNER: signer,
  MEDIA_C2PA_TRUST_ANCHORS: path.join(directory, "root.pem"),
  MEDIA_C2PA_TRUST_ANCHORS_SHA256: createHash("sha256")
    .update(anchor)
    .digest("hex"),
  MEDIA_C2PA_WORKDIR: staging,
};
writeFileSync(
  path.join(directory, "configuration.json"),
  `${JSON.stringify(configuration, null, 2)}\n`,
  { mode: 0o600, flag: "wx" },
);
process.stdout.write(`${JSON.stringify(configuration, null, 2)}\n`);
