import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { isC168GroupCaptureChannel } from "../../utils/company/c168CaptureChannel.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";

/** Redirect away from Process pages when C168 payroll channel hides Process entry. */
export function useC168ProcessRouteGuard() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();

  useEffect(() => {
    if (!sessionReady || !me) return;
    if (isC168GroupCaptureChannel(me)) {
      navigate(spaPath("dashboard"), { replace: true });
    }
  }, [sessionReady, me, navigate]);
}
