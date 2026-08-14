/**
 * Regression: external partner companies remapped onto the viewer's group
 * must appear in company pills (native_group_id may still be the source group).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  companiesExternalRemappedInGroupList,
  companiesForCompanyPicker,
  companiesInGroupList,
  companiesNativeInGroupList,
  companiesPickerInGroupList,
  sortedUniqueGroupIds,
} from "./sharedCompanyFilter.js";

const partnerPortfolio = [
  { id: 1, company_id: "C2", group_id: "KK", native_group_id: "KK", is_external: 0 },
  {
    id: 2,
    company_id: "IT",
    group_id: "KK",
    native_group_id: "JJ",
    is_external: 1,
  },
  {
    id: 3,
    company_id: "IGX",
    group_id: "KK",
    native_group_id: "IG",
    link_source_group: "IG",
    is_external: 0,
  },
];

describe("partner company pills", () => {
  it("shows remapped partner under display group, not only native subsidiaries", () => {
    const groupIds = sortedUniqueGroupIds(partnerPortfolio);
    assert.deepEqual(groupIds, ["KK"]);

    assert.deepEqual(
      companiesNativeInGroupList(partnerPortfolio, "KK").map((r) => r.company_id),
      ["C2"],
    );
    assert.deepEqual(
      companiesExternalRemappedInGroupList(partnerPortfolio, "KK").map((r) => r.company_id),
      ["IT"],
    );
    assert.deepEqual(
      companiesInGroupList(partnerPortfolio, "KK").map((r) => r.company_id),
      ["C2", "IT", "IGX"],
    );

    const picker = companiesForCompanyPicker(partnerPortfolio, "KK", groupIds);
    assert.deepEqual(
      picker.map((r) => r.company_id),
      ["C2", "IT"],
      "virtual group-link IGX must stay off the company pill",
    );
    assert.equal(
      companiesPickerInGroupList(partnerPortfolio, "KK").some((r) => r.company_id === "IT"),
      true,
    );
  });

  it("keeps login-id partners that stay on native group", () => {
    const companies = [
      { id: 1, company_id: "C2", group_id: "KK", native_group_id: "KK", is_external: 0 },
      { id: 2, company_id: "IT", group_id: "JJ", native_group_id: "JJ", is_external: 1 },
    ];
    const groupIds = sortedUniqueGroupIds(companies);
    assert.deepEqual(groupIds, ["JJ", "KK"]);
    assert.deepEqual(
      companiesForCompanyPicker(companies, "JJ", groupIds).map((r) => r.company_id),
      ["IT"],
    );
  });
});
