import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
import { VapiPackagePurchaseEmail } from "@/emails/VapiPackagePurchaseEmail";

// PROJ-11 — +60-Min-Vapi-Paket-Bestätigung.

export type SendVapiPackageInput = {
  to: string;
  fullName?: string;
  projectName: string;
  projectId: string;
  amountFormatted: string;
  paymentDateFormatted: string;
  remainingMinutes?: number;
};

export async function sendVapiPackageMail(
  input: SendVapiPackageInput,
): Promise<void> {
  const siteUrl = getSiteUrl();

  const result = await sendEmail({
    to: input.to,
    subject: `+60 Minuten Erzählzeit für „${input.projectName}"`,
    react: VapiPackagePurchaseEmail({
      fullName: input.fullName,
      projectName: input.projectName,
      projectId: input.projectId,
      amountFormatted: input.amountFormatted,
      paymentDateFormatted: input.paymentDateFormatted,
      remainingMinutes: input.remainingMinutes,
      siteUrl,
    }),
    tags: [{ name: "type", value: "vapi_package" }],
  });

  if (!result.ok) {
    console.error(
      `[email/vapi-package] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
  }
}
