import type { QuestionClassification } from "./types";

export function classifyApplicationQuestion(question: string): QuestionClassification {
  const value = question.toLocaleLowerCase("en");
  if (/captcha|verification code|one-time password|mfa/.test(value)) return "UNSUPPORTED";
  if (/authorized to work|sponsorship|visa|criminal|disability|gender|race|ethnic|legal/.test(value)) return "LEGAL_SENSITIVE";
  if (/salary|compensation|availability|relocat|notice period/.test(value)) return "USER_CONFIRMATION";
  if (/why |describe|explain|tell us|cover letter/.test(value)) return "OPEN_TEXT";
  if (/phone|city|country|portfolio|github|linkedin|remote|language/.test(value)) return "SAFE_STRUCTURED";
  return "USER_CONFIRMATION";
}
