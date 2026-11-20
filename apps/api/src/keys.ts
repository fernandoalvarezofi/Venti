/** Genera el par de claves Ed25519 para firmar QRs. Imprime la privada en base64 (para .env) y la pública en PEM. */
import { generateQrKeyPair } from '@venti/domain';

const { privateKeyPem, publicKeyPem } = generateQrKeyPair();
console.log(`QR_SIGNING_PRIVATE_KEY=${Buffer.from(privateKeyPem).toString('base64')}`);
console.log(`\n# Clave pública (para dispositivos de LinTICK Access):\n${publicKeyPem}`);
