export const EDIT_FORMULA_INPUT_METHODS = [
  { value: "", label: "Select Input Method (Optional)" },
  {
    value: "positive_to_negative_negative_to_positive",
    label: "Positive to negative, negative to positive",
  },
  {
    value: "positive_to_negative_negative_to_zero",
    label: "Positive to negative, negative to zero",
  },
  {
    value: "negative_to_positive_positive_to_zero",
    label: "Negative to positive, positive to zero",
  },
  {
    value: "positive_unchanged_negative_to_zero",
    label: "Positive unchanged, negative to zero",
  },
  {
    value: "negative_unchanged_positive_to_zero",
    label: "Negative unchanged, positive to zero",
  },
  { value: "change_to_positive", label: "Change to positive" },
  { value: "change_to_negative", label: "Change to negative" },
  { value: "change_to_zero", label: "Change to zero" },
];

export const CALCULATOR_KEYPAD = [
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "", "+"],
  ["(", ")", "clear", "equals"],
];
