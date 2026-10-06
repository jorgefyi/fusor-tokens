/**
 * Inlined into .fusor-tokens/terrazzo.config.ts.
 * Returns concrete CSS so alias vars are not emitted as var(ft-…)
 * (the CSS plugin drops the leading dashes on custom variableName results).
 */
export const CSS_TRANSFORM_SOURCE = `
function fusorCssValue(token, options) {
  const tokensSet = options && options.tokensSet ? options.tokensSet : {};
  switch (token.$type) {
    case "color":
      return fusorColor(token, tokensSet);
    case "dimension":
      return fusorDimension(token.$value);
    case "shadow":
      return fusorShadow(token, tokensSet);
    case "fontFamily":
      return fusorFontFamily(token.$value);
    case "fontWeight":
    case "number":
      return String(token.$value);
    default:
      return undefined;
  }
}

function fusorRoot(token, tokensSet) {
  let current = token;
  const seen = new Set();
  while (current && current.aliasChain && current.aliasChain[0] && tokensSet[current.aliasChain[0]] && !seen.has(current.id)) {
    seen.add(current.id);
    current = tokensSet[current.aliasChain[0]];
  }
  return current;
}

function fusorColor(token, tokensSet) {
  const root = fusorRoot(token, tokensSet);
  const authored = root.originalValue && root.originalValue.$value;
  if (typeof authored === "string" && authored.trim().charAt(0) !== "{") return authored.trim();
  if (typeof root.$value === "string") return root.$value;
  return fusorSerializeColor(root.$value);
}

function fusorSerializeColor(value) {
  if (!value || !value.components) return undefined;
  const L = value.components[0] <= 1 ? fusorTrim(value.components[0] * 100) + "%" : fusorTrim(value.components[0]);
  const body = L + " " + fusorTrim(value.components[1]) + " " + fusorTrim(value.components[2]);
  if (value.alpha == null || value.alpha === 1) return "oklch(" + body + ")";
  return "oklch(" + body + " / " + fusorTrim(value.alpha) + ")";
}

function fusorTrim(n) {
  return String(Number(Number(n).toFixed(4)));
}

function fusorDimension(value) {
  if (typeof value === "string") return value === "0px" || value === "0" ? "0" : value;
  if (value && typeof value === "object" && "value" in value) {
    return value.value === 0 ? "0" : String(value.value) + (value.unit || "");
  }
  return undefined;
}

function fusorShadow(token, tokensSet) {
  const authored = token.originalValue && token.originalValue.$value;
  const authoredLayers = authored ? (Array.isArray(authored) ? authored : [authored]) : [];
  const resolved = token.$value;
  const resolvedLayers = Array.isArray(resolved) ? resolved : [resolved];
  const count = Math.max(authoredLayers.length, resolvedLayers.length);
  const layers = [];
  for (let i = 0; i < count; i++) {
    layers.push(fusorShadowLayer(authoredLayers[i] || resolvedLayers[i], resolvedLayers[i], tokensSet));
  }
  return layers.join(", ");
}

function fusorShadowLayer(authored, resolved, tokensSet) {
  const layer = authored || resolved || {};
  const parts = [];
  if (layer.inset === true) parts.push("inset");
  parts.push(fusorZero(layer.offsetX), fusorZero(layer.offsetY), fusorLength(layer.blur));
  if (layer.spread != null && !fusorIsZero(layer.spread)) parts.push(fusorLength(layer.spread));
  parts.push(fusorShadowColor(layer.color, resolved && resolved.color, tokensSet));
  return parts.filter(Boolean).join(" ");
}

function fusorShadowColor(authoredColor, resolvedColor, tokensSet) {
  if (typeof authoredColor === "string") {
    const match = /^\{([A-Za-z0-9_.-]+)\}$/.exec(authoredColor.trim());
    if (match && tokensSet[match[1]]) return fusorColor(tokensSet[match[1]], tokensSet);
    if (authoredColor.trim().charAt(0) !== "{") return authoredColor.trim();
  }
  return fusorSerializeColor(resolvedColor);
}

function fusorIsZero(value) {
  return value === 0 || value === "0" || value === "0px" || value === "0rem";
}

function fusorZero(value) {
  return fusorIsZero(value) ? "0" : fusorLength(value);
}

function fusorLength(value) {
  if (typeof value === "number") return value === 0 ? "0" : String(value) + "px";
  if (typeof value === "string") return fusorIsZero(value) ? "0" : value;
  if (value && typeof value === "object" && "value" in value) {
    return value.value === 0 ? "0" : String(value.value) + (value.unit || "");
  }
  return undefined;
}

function fusorFontFamily(value) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((name) => (/^[a-z-]+$/.test(name) ? name : '"' + name + '"'))
    .join(", ");
}
`.trim();
