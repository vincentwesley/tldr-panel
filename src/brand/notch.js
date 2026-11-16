// Pointer travel (px) -> --logo-x, with a notch at each form where the logo holds while the pointer moves on.
export const X = { short: 540, middle: 734, long: 1491.4 };
const P = [0, 12, 26, 66, 106];
const XS = [X.short, X.short, X.middle, X.middle, X.long];
export const toX = (p) => {
  let i = 1;
  while (i < 4 && p > P[i]) i++;
  return XS[i - 1] + ((XS[i] - XS[i - 1]) * (p - P[i - 1])) / (P[i] - P[i - 1]);
};
