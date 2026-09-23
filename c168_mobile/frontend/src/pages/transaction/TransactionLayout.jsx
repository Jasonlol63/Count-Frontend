import { Outlet, useLocation } from "react-router-dom";
import { useMobileTransaction } from "../../hooks/useMobileTransaction.js";
import "./transaction.css";

/**
 * Keeps transaction list state mounted while navigating to Payment History,
 * so Back returns to the same Search results without remounting the hook.
 */
export default function TransactionLayout() {
  const { pathname } = useLocation();
  const listPaused = pathname.includes("/history");
  const tx = useMobileTransaction({ listPaused });
  return <Outlet context={{ tx }} />;
}
