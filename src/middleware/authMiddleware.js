import jwt from "jsonwebtoken";

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export default function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  // Protected routes expect the standard Bearer token header format.
  if (!authHeader?.startsWith("Bearer ")) {
    return next(createHttpError("Authorization token is required.", 401));
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!process.env.JWT_SECRET) {
    return next(createHttpError("JWT_SECRET is not configured.", 500));
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    // Make the authenticated operator available to downstream handlers.
    req.operator = decodedToken;
    next();
  } catch {
    next(createHttpError("Invalid or expired access token.", 401));
  }
}
