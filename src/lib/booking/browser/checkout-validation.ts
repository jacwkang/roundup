import { BrowserHandoff } from './policy';
/** Narrow read/auth allowlist for the operator-only checkout diagnostic. */
export function allowCheckoutDiagnosticRequest(method: string, raw: string) {
  if (['GET','HEAD','OPTIONS'].includes(method)) return true;
  const url=new URL(raw);
  return method==='POST' && url.protocol==='https:' && url.hostname==='api.resy.com' &&
    /^\/(?:3\/auth\/refresh|3\/details|3\/venuesearch\/search|4\/find)$/.test(url.pathname);
}
export function validateCheckoutEvidence(evidence: { loginVisible: boolean; reserveVisible: boolean; policies: string[] }) {
  if(evidence.loginVisible) throw new BrowserHandoff('login_required');
  if(!evidence.reserveVisible || evidence.policies.length!==1 || !evidence.policies[0].trim())
    throw new BrowserHandoff('checkout_evidence_incomplete');
  // This is evidence for a human, not a machine-approved fee policy or booking quote.
  return {loginPromptAbsent:true,finalActionPresent:true,cancellationPolicy:evidence.policies[0],bookingSubmitted:false};
}
