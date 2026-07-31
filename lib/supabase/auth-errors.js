export class SupabaseAuthConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SupabaseAuthConfigurationError";
    this.code = "auth_configuration_error";
  }
}

export class SupabaseAuthOperationError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "SupabaseAuthOperationError";
    this.code = code;
  }
}
