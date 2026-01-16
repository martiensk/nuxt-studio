import { eventHandler, getCookie, deleteCookie, sendRedirect } from "h3";
import { setInternalStudioUserSession } from "../../utils/session.js";
export default eventHandler(async (event) => {
  const token = process.env.STUDIO_AZURE_DEVOPS_TOKEN;
  if (!token) {
    throw new Error("STUDIO_AZURE_DEVOPS_TOKEN is not set");
  }
  await setInternalStudioUserSession(event, {
    name: "Azure DevOps User",
    email: "user@example.com",
    provider: "azure-devops",
    accessToken: token
  });
  const redirect = decodeURIComponent(getCookie(event, "studio-redirect") || "");
  deleteCookie(event, "studio-redirect");
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
    return sendRedirect(event, redirect);
  }
  return sendRedirect(event, "/");
});
