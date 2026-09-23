import { memo } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { NavLink, useLocation } from "react-router-dom";

/** On-screen movement — ease-in-out feel via low-bounce spring (Emil / Apple style). */
const INDICATOR_SPRING = { type: "spring", duration: 0.42, bounce: 0.1 };
const STATE_EASE = [0.23, 1, 0.32, 1];
const STATE_MS = 0.18;
const TAP_MS = 0.12;

/** More covers Report / Maintenance (entered from More). */
function navTabIsActive(to, pathname) {
  if (to === "/more") {
    return (
      pathname === "/more" ||
      pathname.startsWith("/more/") ||
      pathname.startsWith("/report") ||
      pathname.startsWith("/maintenance")
    );
  }
  if (to === "/member") return pathname === "/member" || pathname.startsWith("/member/");
  if (to === "/dashboard") return pathname === "/dashboard" || pathname === "/home";
  if (to === "/transaction") {
    return pathname === "/transaction" || pathname.startsWith("/transaction/");
  }
  if (to === "/account") return pathname === "/account" || pathname.startsWith("/account/");
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavTab({ item, label, reduceMotion }) {
  const { pathname } = useLocation();
  const isActive = navTabIsActive(item.to, pathname);
  const indicatorTransition = reduceMotion ? { duration: 0 } : INDICATOR_SPRING;
  const stateTransition = reduceMotion ? { duration: 0 } : { duration: STATE_MS, ease: STATE_EASE };
  const tapTransition = reduceMotion ? { duration: 0 } : { duration: TAP_MS, ease: STATE_EASE };

  return (
    <NavLink
      to={item.to}
      end={item.to === "/dashboard"}
      aria-current={isActive ? "page" : undefined}
      className={`m-shell-nav-link${isActive ? " m-shell-nav-link--active" : ""}`}
    >
      {isActive ? (
        <motion.span
          layoutId="m-shell-nav-indicator"
          className="m-shell-nav-indicator"
          transition={indicatorTransition}
        />
      ) : null}
      <motion.span
        className="m-shell-nav-link-inner"
        whileTap={reduceMotion ? undefined : { scale: 0.94 }}
        transition={tapTransition}
      >
        <motion.span
          className="m-shell-nav-glyph"
          aria-hidden="true"
          animate={{
            scale: isActive ? 1.05 : 1,
            y: isActive ? -1 : 0,
            opacity: isActive ? 1 : 0.48,
          }}
          transition={stateTransition}
        >
          <i className={`fas ${item.icon}`} />
        </motion.span>
        <motion.span
          className="m-shell-nav-label"
          animate={{
            opacity: isActive ? 1 : 0.62,
            y: isActive ? 0 : 0.5,
          }}
          transition={stateTransition}
        >
          {label}
        </motion.span>
      </motion.span>
    </NavLink>
  );
}

/**
 * Liquid-glass floating bottom nav — shared layout indicator + press feedback.
 */
function MobileBottomNav({ items, labels }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="m-shell-nav-dock">
      <LayoutGroup id="m-shell-bottom-nav">
        <div className="m-shell-nav-pill">
          {items.map((item) => (
            <NavTab
              key={item.to}
              item={item}
              label={labels[item.key] || item.key}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>
      </LayoutGroup>
    </div>
  );
}

export default memo(MobileBottomNav);
