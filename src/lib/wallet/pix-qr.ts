import QRCode from "qrcode";

/**
 * QR gerado do EMV localmente — não dependemos da imagem do gateway.
 * Retorna data URL pronta para <img src>.
 */
export async function pixQrDataUrl(emv: string): Promise<string | null> {
  const code = String(emv || "").trim();
  if (code.length < 40) return null;
  try {
    return await QRCode.toDataURL(code, {
      width: 260,
      margin: 1,
      color: { dark: "#0b1220", light: "#ffffff" },
    });
  } catch (err) {
    console.error("[pix-qr] falha ao gerar QR", err);
    return null;
  }
}
