function errorHandler(err, req, res, next) {
  if (err.name === "ZodError") {
    return res.status(400).json({
      message: "Validation failed.",
      errors: err.issues
    });
  }

  if ((err.status || 500) >= 500) {
    console.error(err);
  }

  res.status(err.status || 500).json({
    message: err.message || "Internal server error"
  });
}

export default errorHandler;
