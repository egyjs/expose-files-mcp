import { applyRuntimeUpdate, redactConfig, RUNTIME_EDITABLE_FIELDS } from "../config.js";

export class ConfigService {
  constructor(config) {
    this.config = config;
  }

  read() {
    return redactConfig(this.config);
  }

  update(patch) {
    applyRuntimeUpdate(this.config, patch);
    return this.read();
  }

  editableFields() {
    return RUNTIME_EDITABLE_FIELDS;
  }
}
