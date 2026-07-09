import React from "react";

/** Stacked ISO sheets + peeled corner + add plus — branded “Add Process” affordance. */
export default function AddProcessIcon() {
  return (
    <svg className="btn-add__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {/* Back sheet */}
      <path opacity={0.7} d="M4.4 15.65 12 19.82 19.6 15.65 12 11.48z" />
      {/* Front sheet — pentagon suggests lifted top-right corner */}
      <path d="M4.35 11.22 12 15.42 17.92 12.18 19.74 10.95 12 7.12z" />
      {/* Floating plus */}
      <path d="M15.72 3.12h2.1v3.42h3.42v2.08h-3.42v3.42h-2.1v-3.42H12.3V6.54h3.42z" />
    </svg>
  );
}
