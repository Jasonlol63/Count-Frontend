import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RESET_PASSWORD_I18N } from "../../translateFile/auth/authTranslate.js";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { useAuthBackground } from "./useAuthBackground.js";
import { sendResetTac, submitResetPassword } from "./resetPassword.js";
import { sanitizeEmailInput, validateEmail } from "../../utils/input/emailValidation.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";

function AlertModal({ open, title, message, confirmText, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`modal-overlay${open ? " is-open" : ""}`}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-box" role="dialog" aria-labelledby="modalTitle" aria-describedby="modalMessage">
        <div className="modal-icon-wrap">
          <i className="fas fa-exclamation-triangle modal-icon" aria-hidden="true" />
        </div>
        <h3 id="modalTitle" className="modal-title">
          {title}
        </h3>
        <p id="modalMessage" className="modal-message">
          {message}
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn-primary" onClick={onClose}>
            {confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(() => localStorage.getItem("login_lang") || "en");
  const [tenantCode, setTenantCode] = useState("");
  const [email, setEmail] = useState("");
  const [tac, setTac] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSendingTac, setIsSendingTac] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", message: "" });
  const tacInputRef = useRef(null);

  const i18n = useMemo(() => RESET_PASSWORD_I18N[lang] || RESET_PASSWORD_I18N.en, [lang]);

  useEffect(() => {
    localStorage.setItem("login_lang", lang);
  }, [lang]);

  useEffect(() => {
    document.body.classList.remove(
      "transaction-page",
      "member-winloss-page",
      "dashboard-page",
      "account-page",
      "announcement-page",
      "datacapture-page",
      "report-page",
      "process-page",
      "process-page--bank",
      "process-page--show-all",
      "process-page--bank-show-all",
      "user-page",
      "user-page--show-all",
      "page-ready"
    );
  }, []);

  useAuthBackground();

  const showModal = useCallback(
    (title, message) => {
      setModal({
        open: true,
        title: title || i18n.notice,
        message: message || "",
      });
    },
    [i18n.notice]
  );

  const passwordMatched = useMemo(() => {
    if (!confirmPassword) return true;
    return newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  const onSendTac = async () => {
    const normalizedTenantCode = tenantCode.toUpperCase().trim();
    const trimmedEmail = validateEmail(email).normalized;

    if (!normalizedTenantCode) {
      showModal(i18n.notice, i18n.companyIdFirst);
      return;
    }
    if (!trimmedEmail) {
      showModal(i18n.notice, i18n.emailFirst);
      return;
    }
    if (!validateEmail(trimmedEmail).ok) {
      showModal(i18n.notice, i18n.invalidEmailFormat);
      return;
    }

    setIsSendingTac(true);
    try {
      const data = await sendResetTac({
        tenantCode: normalizedTenantCode,
        email: trimmedEmail,
      });

      if (data.success) {
        let message = data.message || i18n.tacSent;
        if (data.tac) {
          message += `\n\n${i18n.verifyCodeLine} ${data.tac}`;
          setTac(data.tac);
        }
        showModal(i18n.success, message);
        requestAnimationFrame(() => {
          tacInputRef.current?.focus();
        });
      } else {
        showModal(i18n.notice, data.message || i18n.tacFailed);
      }
    } catch (error) {
      console.error("Send TAC error:", error);
      showModal(i18n.notice, i18n.networkError);
    } finally {
      setIsSendingTac(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (isResetting) return;

    if (!passwordMatched) {
      showModal(i18n.notice, i18n.passwordsNoMatch);
      return;
    }

    const normalizedTenantCode = tenantCode.toUpperCase().trim();
    const emailCheck = validateEmail(email);
    const trimmedEmail = emailCheck.normalized;
    const trimmedTac = tac.trim();

    if (!trimmedTac) {
      showModal(i18n.notice, i18n.enterTac);
      return;
    }

    if (!normalizedTenantCode || !trimmedEmail) {
      showModal(i18n.notice, i18n.companyEmailRequired);
      return;
    }
    if (!emailCheck.ok) {
      showModal(i18n.notice, i18n.invalidEmailFormat);
      return;
    }

    setIsResetting(true);
    try {
      const data = await submitResetPassword({
        tenantCode: normalizedTenantCode,
        email: trimmedEmail,
        tac: trimmedTac,
        newPassword,
      });

      if (data.success) {
        sessionStorage.setItem("ec_skip_session_bootstrap", "1");
        try {
          await fetch(buildApiUrl("auth/logout"), {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          });
        } catch {
          /* proceed to login even if logout request fails */
        }
        showModal(i18n.success, i18n.resetSuccess);
        setTimeout(() => {
          navigate(spaPath("login"), { replace: true });
        }, 1500);
        return;
      }

      showModal(i18n.notice, data.message || i18n.resetFailed);
      setIsResetting(false);
    } catch (error) {
      console.error("Reset password error:", error);
      showModal(i18n.notice, i18n.networkError);
      setIsResetting(false);
    }
  };

  return (
    <>
      <div className="login-container">
        <div className="login-header">
          <h2>{i18n.pageTitle}</h2>
        </div>
        <div className="login-card">
          <div className="form-content">
            <form className="login-form" onSubmit={onSubmit}>
              <div className="input-group">
                <i className="fas fa-building input-icon" />
                <input
                  type="text"
                  placeholder={i18n.companyPlaceholder}
                  value={tenantCode}
                  onChange={(event) => setTenantCode(event.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="input-group">
                <i className="fas fa-envelope input-icon" />
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  placeholder={i18n.emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(sanitizeEmailInput(event.target.value))}
                  required
                />
              </div>

              <div className="tac-container">
                <div className="input-group">
                  <i className="fas fa-key input-icon" />
                  <input
                    ref={tacInputRef}
                    type="text"
                    placeholder={i18n.tacPlaceholder}
                    value={tac}
                    onChange={(event) => setTac(event.target.value)}
                  />
                </div>
                <button type="button" className="tac-btn" onClick={onSendTac} disabled={isSendingTac}>
                  {isSendingTac ? i18n.sending : i18n.send}
                </button>
              </div>

              <div className="input-group">
                <i className="fas fa-lock input-icon" />
                <input
                  type="password"
                  placeholder={i18n.newPasswordPlaceholder}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <i className="fas fa-lock input-icon" />
                <input
                  type="password"
                  placeholder={i18n.confirmPasswordPlaceholder}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  style={{ borderColor: passwordMatched ? "#e1e5e9" : "#dc3545" }}
                  required
                />
              </div>

              <button type="submit" className="login-btn" disabled={isResetting}>
                <span>{isResetting ? i18n.resetting : i18n.resetButton}</span>
              </button>

              <div className="language-switch-container">
                <div className="lang-switch" role="group" aria-label={i18n.switchLang}>
                  <button
                    type="button"
                    className={`lang-option${lang === "zh" ? " active" : ""}`}
                    onClick={() => setLang("zh")}
                    aria-pressed={lang === "zh"}
                  >
                    中
                  </button>
                  <button
                    type="button"
                    className={`lang-option${lang === "en" ? " active" : ""}`}
                    onClick={() => setLang("en")}
                    aria-pressed={lang === "en"}
                  >
                    EN
                  </button>
                </div>
              </div>

              <div className="back-to-login">
                <a href={spaPath("login")} className="back-link">
                  <i className="fas fa-arrow-left" />
                  {i18n.backToLogin}
                </a>
              </div>
            </form>
          </div>
        </div>
      </div>

      <AlertModal
        open={modal.open}
        title={modal.title}
        message={modal.message}
        confirmText={i18n.confirm}
        onClose={() => setModal((state) => ({ ...state, open: false }))}
      />
    </>
  );
}
