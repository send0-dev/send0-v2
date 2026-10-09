export const STRING_SENTINEL_LIGHT = "#15141b";

function theme(type: "light" | "dark", c: { ink: string; acc: string; muted: string; str: string }) {
  return {
    name: `send0-${type}`,
    type,
    colors: { "editor.background": "#00000000", "editor.foreground": c.ink },
    tokenColors: [
      { settings: { foreground: c.ink } },
      { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: c.muted } },
      {
        scope: [
          "keyword",
          "storage",
          "storage.type",
          "storage.modifier",
          "constant.language",
          "variable.language",
          "keyword.operator.new",
          "keyword.operator.expression",
          "keyword.operator.logical.python",
          "support.type.primitive",
        ],
        settings: { foreground: c.acc },
      },
      { scope: ["keyword.operator", "punctuation"], settings: { foreground: c.ink } },
      { scope: ["string", "string punctuation.definition.string", "string.template"], settings: { foreground: c.str } },
      {
        scope: [
          "string.unquoted",
          "support.type.property-name",
          "support.type.property-name punctuation.definition.string",
          "entity.name.tag.yaml",
          "meta.template.expression",
        ],
        settings: { foreground: c.ink },
      },
    ],
  };
}

export const send0Light = theme("light", { ink: "#15141a", acc: "#4b2eff", muted: "#6b6973", str: STRING_SENTINEL_LIGHT });

export const send0Dark = theme("dark", { ink: "#eeece6", acc: "#8d9cff", muted: "#9c99a3", str: "#eeece7" });
