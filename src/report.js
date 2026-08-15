export const SEVERITY_ERROR = 'error';
export const SEVERITY_WARNING = 'warning';

export class ValidationResult {
  constructor() {
    this.issues = [];
  }

  add(severity, file, message) {
    this.issues.push({ severity, file, message });
    return this;
  }

  addError(file, message) {
    return this.add(SEVERITY_ERROR, file, message);
  }

  addWarning(file, message) {
    return this.add(SEVERITY_WARNING, file, message);
  }

  get errors() {
    return this.issues.filter((issue) => issue.severity === SEVERITY_ERROR);
  }

  get warnings() {
    return this.issues.filter((issue) => issue.severity === SEVERITY_WARNING);
  }

  get ok() {
    return this.errors.length === 0;
  }

  summary() {
    return {
      errors: this.errors.length,
      warnings: this.warnings.length,
    };
  }
}