window.__ModuleLoader__.load({
  id: "dsh-better-plugin-updater",
  factory: (require) => {
    var module = { exports: {} };
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/locales.ts
function formLabels(t) {
  return {
    unavailable: t("unavailable"),
    readOnly: t("readOnly"),
    saveFailed: t("saveFailed"),
    save: t("save"),
    saving: t("saving")
  };
}
var en, zh;
var init_locales = __esm({
  "src/client/locales.ts"() {
    "use strict";
    en = {
      title: "Plugin updater",
      summary: "Checks registry and GitHub releases, then applies the update you review.",
      language: "Plugin language",
      languageHint: "Language the plugin uses for its own output. Auto follows the interface.",
      languageAuto: "Auto",
      languageEn: "English",
      languageZh: "\u7B80\u4F53\u4E2D\u6587",
      requestTimeout: "Request timeout",
      requestTimeoutHint: "Deadline for one registry or metadata request, in milliseconds.",
      maxMetadata: "Max metadata size",
      maxMetadataHint: "Largest registry response this plugin reads, in bytes.",
      planLifetime: "Confirmation lifetime",
      planLifetimeHint: "How long an update confirmation stays valid, in milliseconds.",
      tokenVariable: "GitHub token variable",
      tokenVariableHint: "Name of the environment variable holding a token. The token itself never enters this page.",
      overridden: "Overridden",
      reset: "Reset",
      invalid: "Enter a whole number within the allowed range.",
      readOnly: "This deployment stores settings read-only.",
      unavailable: "This plugin is not loaded, so it cannot be configured right now.",
      save: "Save",
      saving: "Saving\u2026",
      saveFailed: "The deployment did not accept these values; they were left for you to correct."
    };
    zh = {
      title: "\u63D2\u4EF6\u66F4\u65B0\u52A9\u624B",
      summary: "\u68C0\u67E5 registry \u4E0E GitHub \u4E0A\u7684\u53D1\u5E03\uFF0C\u7136\u540E\u6267\u884C\u4F60\u786E\u8BA4\u8FC7\u7684\u66F4\u65B0\u3002",
      language: "\u63D2\u4EF6\u8BED\u8A00",
      languageHint: "\u63D2\u4EF6\u81EA\u8EAB\u8F93\u51FA\u4F7F\u7528\u7684\u8BED\u8A00\u3002\u81EA\u52A8\u8DDF\u968F\u754C\u9762\u8BED\u8A00\u3002",
      languageAuto: "\u81EA\u52A8",
      languageEn: "English",
      languageZh: "\u7B80\u4F53\u4E2D\u6587",
      requestTimeout: "\u8BF7\u6C42\u8D85\u65F6",
      requestTimeoutHint: "\u5355\u6B21 registry \u6216\u5143\u6570\u636E\u8BF7\u6C42\u7684\u65F6\u9650\uFF0C\u5355\u4F4D\u4E3A\u6BEB\u79D2\u3002",
      maxMetadata: "\u5143\u6570\u636E\u5927\u5C0F\u4E0A\u9650",
      maxMetadataHint: "\u672C\u63D2\u4EF6\u63A5\u53D7\u7684 registry \u54CD\u5E94\u6700\u5927\u5B57\u8282\u6570\u3002",
      planLifetime: "\u786E\u8BA4\u6709\u6548\u671F",
      planLifetimeHint: "\u66F4\u65B0\u786E\u8BA4\u4FDD\u6301\u6709\u6548\u7684\u65F6\u957F\uFF0C\u5355\u4F4D\u4E3A\u6BEB\u79D2\u3002",
      tokenVariable: "GitHub \u4EE4\u724C\u53D8\u91CF\u540D",
      tokenVariableHint: "\u4FDD\u5B58\u4EE4\u724C\u7684\u73AF\u5883\u53D8\u91CF\u540D\u3002\u4EE4\u724C\u672C\u8EAB\u4E0D\u4F1A\u51FA\u73B0\u5728\u672C\u9875\u3002",
      overridden: "\u5DF2\u8986\u76D6",
      reset: "\u6062\u590D\u9ED8\u8BA4",
      invalid: "\u8BF7\u586B\u5199\u5141\u8BB8\u8303\u56F4\u5185\u7684\u6574\u6570\u3002",
      readOnly: "\u672C\u90E8\u7F72\u7684\u8BBE\u7F6E\u4E3A\u53EA\u8BFB\u3002",
      unavailable: "\u8BE5\u63D2\u4EF6\u5F53\u524D\u672A\u52A0\u8F7D\uFF0C\u6682\u65F6\u65E0\u6CD5\u914D\u7F6E\u3002",
      save: "\u4FDD\u5B58",
      saving: "\u4FDD\u5B58\u4E2D\u2026",
      saveFailed: "\u672C\u90E8\u7F72\u6CA1\u6709\u63A5\u53D7\u8FD9\u4E9B\u503C\uFF0C\u5DF2\u4FDD\u7559\u4F9B\u4F60\u4FEE\u6539\u3002"
    };
  }
});

// src/client/settings-controller.ts
var settings_controller_exports = {};
__export(settings_controller_exports, {
  UpdaterCardController: () => UpdaterCardController
});
var import_dsh_client_ui_primitives, UpdaterCardController;
var init_settings_controller = __esm({
  "src/client/settings-controller.ts"() {
    "use strict";
    import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    UpdaterCardController = class {
      form;
      store;
      /** @param scope - the bound settings scope for this plugin's namespace. */
      constructor(scope) {
        this.form = new import_dsh_client_ui_primitives.SettingsFormModel(scope, [
          (0, import_dsh_client_ui_primitives.settingsTextField)("language"),
          (0, import_dsh_client_ui_primitives.settingsNumberField)("requestTimeoutMs"),
          (0, import_dsh_client_ui_primitives.settingsNumberField)("maxMetadataBytes"),
          (0, import_dsh_client_ui_primitives.settingsNumberField)("planTtlMs"),
          (0, import_dsh_client_ui_primitives.settingsTextField)("githubTokenEnv")
        ]);
        this.store = this.form.bind(() => this.projection());
      }
      projection() {
        return {
          ...this.form.shell(),
          language: this.form.field("language"),
          requestTimeoutMs: this.form.field("requestTimeoutMs"),
          maxMetadataBytes: this.form.field("maxMetadataBytes"),
          planTtlMs: this.form.field("planTtlMs"),
          githubTokenEnv: this.form.field("githubTokenEnv")
        };
      }
      /**
       * Build the face the page's slot registration injects.
       * @returns the page's snapshot and its form actions.
       */
      inject() {
        return { hooks: { updaterCard: this.store }, ...this.form.actions() };
      }
      /** Release accepted-value subscriptions. */
      dispose() {
        this.form.dispose();
      }
    };
  }
});

// src/client/settings-page.tsx
var settings_page_exports = {};
__export(settings_page_exports, {
  UpdaterSettingsPage: () => UpdaterSettingsPage
});
function LanguageField(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.field, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.head, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.labelGroup, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: STYLE.label, id: "plugin-config-updater-language-label", children: props.label }) }),
      props.overridden ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: STYLE.badges, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: STYLE.tag, children: props.overriddenLabel }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: STYLE.reset, disabled: props.disabled, onClick: props.onReset, children: props.resetLabel })
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives2.SegmentedControl,
      {
        id: "plugin-config-updater-language",
        label: props.label,
        value: props.value,
        options: props.options,
        disabled: props.disabled,
        onChange: props.onChange
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: STYLE.hint, children: props.hint })
  ] });
}
function UpdaterSettingsPage(props) {
  const state = props.useUpdaterCard((snapshot) => snapshot);
  const { t } = props;
  const disabled = !state.writable || state.saving;
  if (props.view === "summary") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: t("summary") });
  const field = (name, label, hint, value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives2.SettingsValueField,
    {
      id: `plugin-config-updater-${name}`,
      label,
      hint,
      overriddenLabel: t("overridden"),
      resetLabel: t("reset"),
      invalidLabel: t("invalid"),
      disabled,
      ...value,
      onEdit: (text) => {
        props.edit(name, text);
      },
      onReset: () => {
        props.resetField(name);
      }
    }
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives2.SettingsForm, { labels: formLabels(t), state, onSave: props.save, onDiscard: props.discard, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      LanguageField,
      {
        label: t("language"),
        hint: t("languageHint"),
        value: readLanguage(state.language.text),
        overridden: state.language.overridden,
        disabled,
        options: LANGUAGES.map((choice) => ({ value: choice.value, label: t(choice.key) })),
        overriddenLabel: t("overridden"),
        resetLabel: t("reset"),
        onChange: (next) => {
          props.edit("language", next);
        },
        onReset: () => {
          props.resetField("language");
        }
      }
    ),
    field("requestTimeoutMs", t("requestTimeout"), t("requestTimeoutHint"), state.requestTimeoutMs),
    field("maxMetadataBytes", t("maxMetadata"), t("maxMetadataHint"), state.maxMetadataBytes),
    field("planTtlMs", t("planLifetime"), t("planLifetimeHint"), state.planTtlMs),
    field("githubTokenEnv", t("tokenVariable"), t("tokenVariableHint"), state.githubTokenEnv)
  ] });
}
function readLanguage(text) {
  const known = LANGUAGES.some((choice) => choice.value === text);
  return known ? text : "auto";
}
var import_dsh_client_ui_primitives2, import_jsx_runtime, LANGUAGES, STYLE;
var init_settings_page = __esm({
  "src/client/settings-page.tsx"() {
    "use strict";
    import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
    init_locales();
    import_jsx_runtime = require("react/jsx-runtime");
    LANGUAGES = [
      { value: "auto", key: "languageAuto" },
      { value: "en", key: "languageEn" },
      { value: "zh", key: "languageZh" }
    ];
    STYLE = {
      field: { display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderBottom: "0.5px solid var(--dsw-alias-border-l2)" },
      head: { display: "flex", alignItems: "center", gap: 8 },
      labelGroup: { display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 },
      label: { fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: "var(--dsw-alias-label-primary)" },
      badges: { display: "inline-flex", alignItems: "center", gap: 8 },
      reset: { border: "none", background: "none", padding: 0, font: "inherit", fontSize: 12, lineHeight: 1.5, color: "var(--dsw-alias-label-secondary)", cursor: "pointer" },
      hint: { margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--dsw-alias-label-tertiary)" },
      tag: { padding: "0 6px", border: "0.5px solid var(--dsw-alias-border-l2)", borderRadius: "var(--dsw-radius-sm)", fontSize: 12, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)" }
    };
  }
});

// src/client/repository-link.tsx
var repository_link_exports = {};
__export(repository_link_exports, {
  RepositoryLink: () => RepositoryLink
});
function RepositoryLink({ subject, bundleName }) {
  if (subject.kind !== "bundle" || subject.pkg.name !== bundleName) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", size: "sm", onClick: () => {
    window.open("https://github.com/Mooling0602/dsh-better-plugin-updater", "_blank", "noopener,noreferrer");
  }, children: "GitHub" });
}
var import_dsh_client_ui_primitives3, import_jsx_runtime2;
var init_repository_link = __esm({
  "src/client/repository-link.tsx"() {
    "use strict";
    import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
    import_jsx_runtime2 = require("react/jsx-runtime");
  }
});

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  BUNDLE_NAME: () => BUNDLE_NAME,
  ENTRY_ID: () => ENTRY_ID,
  NS: () => NS,
  apply: () => apply,
  captureHostRequire: () => captureHostRequire,
  inject: () => inject,
  installLanguageBridge: () => installLanguageBridge,
  mountRepositoryLink: () => mountRepositoryLink,
  mountSettingsPage: () => mountSettingsPage,
  withClientLanguage: () => withClientLanguage
});
module.exports = __toCommonJS(index_exports);

// src/language.ts
function normalizeLanguage(value) {
  if (typeof value !== "string" || value.length > 63 || value.trim() !== value || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value)) return void 0;
  const primary = value.split("-")[0]?.toLowerCase();
  return primary === "en" || primary === "zh" ? primary : void 0;
}

// src/client/index.ts
init_locales();
var NS = "settings.updater";
function withClientLanguage(line, language) {
  const selected = normalizeLanguage(language);
  if (!selected || typeof line !== "string" || !/^\/plugin-updater(?:\s|$)/.test(line)) return line;
  return `${line} --client-lang ${selected}`;
}
function installLanguageBridge(commands, activeLanguage) {
  const previous = Object.getOwnPropertyDescriptor(commands, "execute");
  if (!previous || previous.configurable !== true || typeof previous.get !== "function" && typeof previous.value !== "function") {
    throw new Error("The updater language bridge requires a configurable commands.execute method.");
  }
  let active = true;
  const get = function() {
    const execute = previous.get ? Reflect.apply(previous.get, this, []) : previous.value;
    if (typeof execute !== "function") throw new Error("commands.execute is unavailable.");
    return function(...args) {
      if (!active || typeof args[1] !== "string" || !/^\/plugin-updater(?:\s|$)/.test(args[1])) return Reflect.apply(execute, this, args);
      let language;
      try {
        language = activeLanguage();
      } catch {
      }
      const forwarded = [...args];
      forwarded[1] = withClientLanguage(args[1], language);
      return Reflect.apply(execute, this, forwarded);
    };
  };
  Object.defineProperty(commands, "execute", { configurable: true, enumerable: previous.enumerable ?? true, get });
  return () => {
    active = false;
    if (Object.getOwnPropertyDescriptor(commands, "execute")?.get === get) Object.defineProperty(commands, "execute", previous);
  };
}
var inject = ["locale", "remote.commands"];
var ENTRY_ID = "better-plugin-updater";
var BUNDLE_NAME = "dsh-better-plugin-updater";
var hostRequire;
function captureHostRequire(resolver) {
  hostRequire = resolver;
}
function mountSettingsPage(ctx) {
  ctx.inject(["slots", "configForms", "locale"], (inner) => inner.effect(() => {
    const locale = inner.locale;
    const releaseDicts = locale?.register(NS, { en, zh });
    const disposePage = inner.configForms.whileServed([ENTRY_ID], () => {
      if (!hostRequire) return () => {
      };
      const controllerModule = (init_settings_controller(), __toCommonJS(settings_controller_exports));
      const page = (init_settings_page(), __toCommonJS(settings_page_exports));
      const controller = new controllerModule.UpdaterCardController(
        inner.configForms.get(ENTRY_ID)
      );
      const face = controller.inject();
      const Card = page.UpdaterSettingsPage;
      const disposeSlot = inner.slots.inject("plugins.bundle.config", () => inner.slots.register({
        name: "plugins.bundle.config",
        key: BUNDLE_NAME,
        ...releaseDicts ? { locale: NS } : {},
        inject: () => face
      }, Card));
      return () => {
        disposeSlot?.();
        controller.dispose();
      };
    });
    return () => {
      disposePage?.();
      releaseDicts?.();
    };
  }, "dsh-better-plugin-updater: settings page"));
}
function mountRepositoryLink(ctx) {
  ctx.inject(["slots"], (inner) => inner.slots.inject("plugins.detail.actions", () => {
    if (!hostRequire) return () => {
    };
    const { RepositoryLink: RepositoryLink2 } = (init_repository_link(), __toCommonJS(repository_link_exports));
    return inner.slots.register({
      name: "plugins.detail.actions",
      id: `${BUNDLE_NAME}.github`,
      inject: () => ({ bundleName: BUNDLE_NAME })
    }, RepositoryLink2);
  }));
}
function apply(ctx) {
  const commands = ctx.get("remote.commands");
  const locale = ctx.get("locale");
  mountSettingsPage(ctx);
  mountRepositoryLink(ctx);
  if (!commands || !locale) return;
  ctx.effect(() => installLanguageBridge(commands, () => locale.getSnapshot().active));
}

    module.exports.captureHostRequire?.(require);
    return module.exports;
  }
});
