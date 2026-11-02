window.__ModuleLoader__.load({
  id: "dsh-better-plugin-updater",
  factory: () => {
    var module = { exports: {} };
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  installLanguageBridge: () => installLanguageBridge,
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
function apply(ctx) {
  const commands = ctx.get("remote.commands");
  const locale = ctx.get("locale");
  if (!commands || !locale) throw new Error("The updater Client requires locale and remote.commands.");
  ctx.effect(() => installLanguageBridge(commands, () => locale.getSnapshot().active));
}

    return module.exports;
  }
});
