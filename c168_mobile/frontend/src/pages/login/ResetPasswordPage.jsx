import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RESET_PASSWORD_I18N, localizeAuthApiMessage } from "../../translateFile/authTranslate.js";
import { logoutSession, resetPasswordRequest, sendResetTacRequest } from "../../lib/authApi.js";
import { useSyncedLoginLang, writeLoginLang } from "../../lib/loginLang.js";
import { sanitizeEmailInput, validateEmail } from "../../lib/emailValidation.js";
import { useAuthBackground } from "./useAuthBackground.js";
import PasswordInput from "../../components/PasswordInput.jsx";

/**
 * Reset Password (TAC flow) — Spring `POST /auth/send-reset-tac` + `POST /auth/reset-password`.
 *
 * Replaces the `/reset-password` `StubPage` placeholder. The API wrappers already existed in
 * `lib/authApi.js` and were simply never called from mobile, exactly like desktop before its
 * 2026-08-27 migration (see `Count-frontend/docs/reset-password-tac-implementation.md`, which this
 * page follows: one-shot form rather than a TAC-then-password two-step, inline TAC notice instead
 * of a modal, and a client-side 60s resend cooldown matching the backend's Redis lock).
 *
 * Two behaviours worth keeping:
 *   - the send-TAC success copy is shown **verbatim** — the backend never discloses whether an
 *     account exists, so the UI must not infer it;
 *   - editing the company code or email clears the cooldown and the notice, because the backend's
 *     cooldown key is the `(tenantCode, email)` pair.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => RESET_PASSWORD_I18N[lang] || RESET_PASSWORD_I18N.en, [lang]);

  const [tenantCode, setTenantCode] = useState("");
  const [email, setEmail] = useState("");
  const [tac, setTac] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSendingTac, setIsSendingTac] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [tacCooldown, setTacCooldown] = useState(0);
  const [tacNotice, setTacNotice] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [done, setDone] = useState(false);
  const tacInputRef = useRef(null);
  const tacCooldownActive = tacCooldown > 0;

  useAuthBackground();

  useEffect(() => {
    if (!tacCooldownActive) return undefined;
    const timer = setInterval(() => {
      setTacCooldown((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [tacCooldownActive]);

  // The resend lock is scoped to one company+email pair — editing either invalidates it locally.
  useEffect(() => {
    setTacCooldown(0);
    setTacNotice(null);
  }, [tenantCode, email]);

  const passwordMatched = useMemo(() => {
    if (!confirmPassword) return true;
    return newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  const loginHref = () => new URL("/login", window.location.origin).href;

  const onSendTac = useCallback(async () => {
    if (isSendingTac || tacCooldownActive) return;

    const normalizedTenantCode = tenantCode.toUpperCase().trim();
    const trimmedEmail = validateEmail(email).normalized;

    setErrorMessage("");
    if (!normalizedTenantCode) {
      setErrorMessage(i18n.companyIdFirst);
      return;
    }
    if (!trimmedEmail) {
      setErrorMessage(i18n.emailFirst);
      return;
    }
    if (!validateEmail(trimmedEmail).ok) {
      setErrorMessage(i18n.invalidEmailFormat);
      return;
    }

    setIsSendingTac(true);
    setTacNotice(null);
    try {
      const json = await sendResetTacRequest({
        tenantCode: normalizedTenantCode,
        email: trimmedEmail,
      });
      if (json?.success) {
        setTacNotice({
          type: "success",
          text: localizeAuthApiMessage(json.message, lang) || i18n.tacSent,
        });
        setTacCooldown(60);
        requestAnimationFrame(() => tacInputRef.current?.focus());
      } else {
        setTacNotice({
          type: "error",
          text: localizeAuthApiMessage(json?.message, lang) || i18n.tacFailed,
        });
      }
    } catch {
      setTacNotice({ type: "error", text: i18n.networkError });
    } finally {
      setIsSendingTac(false);
    }
  }, [
    isSendingTac,
    tacCooldownActive,
    tenantCode,
    email,
    i18n,
    lang,
  ]);

  const onSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (isResetting) return;

      const normalizedTenantCode = tenantCode.toUpperCase().trim();
      const emailCheck = validateEmail(email);
      const trimmedEmail = emailCheck.normalized;
      const trimmedTac = tac.trim();

      if (!passwordMatched) {
        setErrorMessage(i18n.passwordsNoMatch);
        return;
      }
      if (!trimmedTac) {
        setErrorMessage(i18n.enterTac);
        return;
      }
      if (!normalizedTenantCode || !trimmedEmail) {
        setErrorMessage(i18n.companyEmailRequired);
        return;
      }
      if (!emailCheck.ok) {
        setErrorMessage(i18n.invalidEmailFormat);
        return;
      }

      setIsResetting(true);
      setErrorMessage("");
      try {
        const json = await resetPasswordRequest({
          tenantCode: normalizedTenantCode,
          email: trimmedEmail,
          tac: trimmedTac,
          newPassword,
        });

        if (json?.success) {
          // Drop the session before bouncing to login, mirroring desktop; a failure here must not
          // strand the user on a page whose password no longer matches the session's cookie.
          sessionStorage.setItem("ec_skip_session_bootstrap", "1");
          try {
            await logoutSession();
          } catch {
            /* proceed to login regardless */
          }
          setDone(true);
          setTimeout(() => navigate("/login", { replace: true }), 1500);
          return;
        }

        setErrorMessage(localizeAuthApiMessage(json?.message, lang) || i18n.resetFailed);
      } catch {
        setErrorMessage(i18n.networkError);
      } finally {
        setIsResetting(false);
      }
    },
    [i18n, isResetting, lang, navigate, newPassword, passwordMatched, tac, tenantCode, email],
  );

  return (
    <div className="sc-login-column">
      <div className="sc-login-shell">
        <div className="sc-login-card sc-login-card--secondary">
          <div className="sc-secondary-header">
            <button
              type="button"
              className="sc-secondary-back"
              onClick={() => window.location.assign(loginHref())}
              aria-label={i18n.backToLogin}
            >
              <i className="fas fa-arrow-left" aria-hidden="true" />
            </button>
            <h1 className="sc-secondary-title">{i18n.pageTitle}</h1>
          </div>

          <div className="sc-login-card-content">
            {done ? (
              <p className="sc-secondary-lead" role="status">
                {i18n.resetSuccess}
              </p>
            ) : (
              <form className="sc-login-form" onSubmit={onSubmit}>
                <div className="sc-login-input-row">
                  <i className="fas fa-building sc-login-input-icon" />
                  <input
                    type="text"
                    className="sc-login-input"
                    placeholder={i18n.companyPlaceholder}
                    value={tenantCode}
                    onChange={(event) => setTenantCode(event.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </div>

                <div className="sc-login-input-row">
                  <i className="fas fa-envelope sc-login-input-icon" />
                  <input
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    className="sc-login-input"
                    placeholder={i18n.emailPlaceholder}
                    value={email}
                    onChange={(event) => setEmail(sanitizeEmailInput(event.target.value))}
                    required
                  />
                </div>

                <div className="sc-login-tac-row">
                  <div className="sc-login-input-row">
                    <i className="fas fa-key sc-login-input-icon" />
                    <input
                      ref={tacInputRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="sc-login-input"
                      placeholder={i18n.tacPlaceholder}
                      value={tac}
                      onChange={(event) => setTac(event.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="sc-login-tac-btn tap-scale"
                    onClick={onSendTac}
                    disabled={isSendingTac || tacCooldownActive}
                  >
                    {isSendingTac
                      ? i18n.sending
                      : tacCooldownActive
                        ? i18n.resendCountdown.replace("{s}", String(tacCooldown))
                        : i18n.send}
                  </button>
                </div>

                {tacNotice ? (
                  <p className={`sc-login-tac-notice sc-login-tac-notice--${tacNotice.type}`} role="status">
                    {tacNotice.text}
                  </p>
                ) : null}

                <div className="sc-login-input-row">
                  <i className="fas fa-lock sc-login-input-icon" />
                  <PasswordInput
                    id="new_password"
                    className="sc-login-input"
                    placeholder={i18n.newPasswordPlaceholder}
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    showLabel={i18n.showPassword}
                    hideLabel={i18n.hidePassword}
                    onFocus={(e) => {
                      requestAnimationFrame(() => {
                        e.target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
                      });
                    }}
                  />
                </div>

                <div className="sc-login-input-row">
                  <i className="fas fa-lock sc-login-input-icon" />
                  <PasswordInput
                    id="confirm_password"
                    className="sc-login-input"
                    placeholder={i18n.confirmPasswordPlaceholder}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    showLabel={i18n.showPassword}
                    hideLabel={i18n.hidePassword}
                  />
                </div>

                {errorMessage ? (
                  <div className="sc-secondary-error" role="alert">
                    {errorMessage}
                  </div>
                ) : null}

                <button type="submit" className="sc-login-submit tap-scale" disabled={isResetting}>
                  {isResetting ? i18n.resetting : i18n.resetButton}
                </button>

                <div className="sc-login-lang-switch-wrap">
                  <div className="sc-login-lang-switch" data-lang={lang} role="group">
                    <button
                      type="button"
                      className={`sc-login-lang-option${lang === "zh" ? " active" : ""}`}
                      onClick={() => setLangState(writeLoginLang("zh"))}
                      aria-pressed={lang === "zh"}
                    >
                      中
                    </button>
                    <button
                      type="button"
                      className={`sc-login-lang-option${lang === "en" ? " active" : ""}`}
                      onClick={() => setLangState(writeLoginLang("en"))}
                      aria-pressed={lang === "en"}
                    >
                      EN
                    </button>
                  </div>
                </div>

                <div className="sc-login-back-to-login">
                  <button
                    type="button"
                    className="sc-login-forgot-link"
                    onClick={() => window.location.assign(loginHref())}
                  >
                    <i className="fas fa-arrow-left" aria-hidden="true" /> {i18n.backToLogin}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
