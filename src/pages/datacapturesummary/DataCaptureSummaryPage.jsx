import { Component } from "react";
import { getDataCaptureSummaryText } from "../../translateFile/pages/dataCaptureSummaryTranslate.js";
import DataCaptureSummaryPagePure from "./DataCaptureSummaryPagePure.jsx";

import "../../../public/css/account-list.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/datacapturesummary.css";
import "../../../public/css/global-13inch.css";

class SummaryPageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const lang = localStorage.getItem("login_lang") === "zh" ? "zh" : "en";
      return (
        <div className="container">
          <p role="alert" style={{ color: "#b91c1c", padding: "12px 0" }}>
            {getDataCaptureSummaryText(lang, "loadPageFailed")}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Summary page — pure React only (no legacy hybrid). */
export default function DataCaptureSummaryPage() {
  return (
    <SummaryPageErrorBoundary>
      <DataCaptureSummaryPagePure />
    </SummaryPageErrorBoundary>
  );
}
