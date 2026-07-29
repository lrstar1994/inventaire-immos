export class StorageConfigurationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "StorageConfigurationError";
    this.status = 500;
  }
}

export class StorageValidationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "StorageValidationError";
    this.status = 400;
  }
}

export class StorageObjectNotFoundError extends Error {
  constructor(message = "Fichier introuvable.", options) {
    super(message, options);
    this.name = "StorageObjectNotFoundError";
    this.status = 404;
  }
}

export class StorageConflictError extends Error {
  constructor(message = "Un fichier existe deja a cet emplacement.", options) {
    super(message, options);
    this.name = "StorageConflictError";
    this.status = 409;
  }
}

export class StorageProviderError extends Error {
  constructor(message = "Le service de stockage est indisponible.", options) {
    super(message, options);
    this.name = "StorageProviderError";
    this.status = 502;
  }
}
