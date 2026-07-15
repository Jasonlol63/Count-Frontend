import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SECONDARY_VERIFY_I18N, localizeAuthApiMessage } from "../../translateFile/auth/authTranslate.js";
import SecondaryVerifyBackButton from "./SecondaryVerifyBackButton.jsx";
import { useAuthBackground } from "./useAuthBackground.js";
import {
  fetchCurrentUser,
  logoutSession,
  verifyOwnerSecondaryPassword,
  verifyUserSecondaryPassword,
} from "../../utils/auth/authApi.js";
import { resolveDefaultLandingPath } from "../../utils/auth/sidebarPermissions.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";

const VARIANT_CONFIG = {
  owner: {
    expectedUserType: "owner",
    verify: verifyOwnerSecondaryPassword,
    shouldRedirectToDashboard(user) {
      return !user.needs_owner_secondary;
    },
    returnAfterWrongUserType: true,
  },
  user: {
    expectedUserType: "user",
    verify: verifyUserSecondaryPassword,
    shouldRedirectToDashboard() {
      return false;
    },
    returnAfterWrongUserType: false,
  },
};

export default function SecondaryPasswordPage({ variant }) {
  const config = VARIANT_CONFIG[variant];
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [lang, setLang] = useState(() => localStorage.getItem("login_lang") || "en");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const i18n = useMemo(() => SECONDARY_VERIFY_I18N[lang] || SECONDARY_VERIFY_I18N.en, [lang]);

  useEffect(() => {
    localStorage.setItem("login_lang", lang);
  }, [lang]);

  useEffect(() => {
    setErrorMessage("");
  }, [lang]);

  useAuthBackground();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { ok, json } = await fetchCurrentUser();
        if (!ok || !json?.success || !json?.data) {
          if (!cancelled) navigate(spaPath("login"), { replace: true });
          return;
        }
        const user = json.data;
        if (String(user.user_type || "").toLowerCase() !== config.expectedUserType) {
          if (!cancelled) navigate(spaPath("login"), { replace: true });
          if (config.returnAfterWrongUserType) return;
        }
        if (config.shouldRedirectToDashboard(user)) {
          if (!cancelled) {
            const landing = resolveDefaultLandingPath(user);
            navigate(landing || spaPath("login"), { replace: true });
          }
        }
      } catch {
        if (!cancelled) navigate(spaPath("login"), { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, config]);

  const onChange = (e) => {
    const numericOnly = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
    setPassword(numericOnly);
    if (errorMessage) setErrorMessage("");
  };

  const onPaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData("text");
    const numericOnly = pasted.replace(/[^0-9]/g, "").slice(0, 6);
    setPassword(numericOnly);
    if (errorMessage) setErrorMessage("");
  };

  const onBack = async () => {
    try {
      sessionStorage.setItem("ec_skip_session_bootstrap", "1");
      await logoutSession();
    } catch {
      // still return to login
    }
    window.location.assign(new URL(spaPath("login"), window.location.origin).href);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const value = password.trim();
    if (!/^\d{6}$/.test(value)) {
      setErrorMessage(i18n.digitsSix);
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      const { ok, json } = await config.verify(value);
      if (ok && json?.success) {
        try {
          const userRes = await fetchCurrentUser();
          if (userRes.ok && userRes.json?.success && userRes.json?.data) {
            const landing = resolveDefaultLandingPath(userRes.json.data);
            navigate(landing || spaPath("login"), { replace: true });
            return;
          }
        } catch {
          /* fall through */
        }
        navigate(spaPath("dashboard"), { replace: true });
        return;
      }
      setErrorMessage(localizeAuthApiMessage(json?.message, lang) || i18n.genericError);
      inputRef.current?.focus();
    } catch {
      setErrorMessage(i18n.genericError);
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card login-card--solo">
        <div className="form-content form-content--secondary-verify">
          <div className="secondary-verify-header">
            <SecondaryVerifyBackButton onClick={onBack} ariaLabel={i18n.backToLogin} />
            <h2 className="secondary-verify-title">{i18n.title}</h2>
          </div>
          <p className="secondary-verify-lead">{i18n.lead}</p>

          <form className="login-form" onSubmit={onSubmit}>
            <div className="input-group">
              <i className="fas fa-lock input-icon" />
              <input
                id="secondary_password"
                ref={inputRef}
                type="password"
                placeholder={i18n.placeholder}
                maxLength={6}
                pattern="[0-9]{6}"
                autoComplete="off"
                required
                autoFocus
                value={password}
                onChange={onChange}
                onPaste={onPaste}
              />
            </div>

            {errorMessage ? (
              <div
                style={{
                  backgroundColor: "#fee2e2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 20,
                  fontSize: 14,
                }}
              >
                {errorMessage}
              </div>
            ) : null}

            <button type="submit" className="login-btn" disabled={submitting}>
              <span>{submitting ? i18n.verifying : i18n.verify}</span>
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
          </form>
        </div>
      </div>
    </div>
  );
}
