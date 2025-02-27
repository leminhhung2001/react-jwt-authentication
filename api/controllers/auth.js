const { validationResult } = require("express-validator");
const bcrypt = require("bcrypt");
const JWT = require("jsonwebtoken");
const { users } = require("../database");
let refreshTokens = [];

// Sign up
exports.signUp = async (req, res) => {
  const { email, password } = req.body;

  // Validate user input
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: errors.array(),
    });
  }

  // Validate if user already exists
  let user = users.find((user) => {
    return user.email === email;
  });

  if (user) {
    // 422 Unprocessable Entity: server understands the content type of the request entity
    // 200 Ok: Gmail, Facebook, Amazon, Twitter are returning 200 for user already exists
    return res.status(200).json({
      errors: [
        {
          email: user.email,
          msg: "The user already exists",
        },
      ],
    });
  }

  // Hash password before saving to database
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Save email and password to database/array
  users.push({
    email,
    password: hashedPassword,
  });

  // Do not include sensitive information in JWT
  const accessToken = await JWT.sign(
    { email },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "20s",
    }
  );

  res.json({
    accessToken,
  });
};

// Log in
exports.signIn = async (req, res) => {
  const { email, password } = req.body;

  // Look for user email in the database
  let user = users.find((user) => {
    return user.email === email;
  });

  // If user not found, send error message
  if (!user) {
    return res.status(400).json({
      errors: [
        {
          msg: "Invalid credentials",
        },
      ],
    });
  }

  // Compare hased password with user password to see if they are valid
  let isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({
      errors: [
        {
          msg: "Email or password is invalid",
        },
      ],
    });
  }

  // Send JWT access token
  const accessToken = await JWT.sign(
    { email },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "20s",
    }
  );

  // Refresh token
  const refreshToken = await JWT.sign(
    { email },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "30s",
    }
  );

  // Set refersh token in refreshTokens array
  refreshTokens.push(refreshToken);

  res.json({
    accessToken,
    refreshToken,
  });
};

// 401 Unauthorized: it’s for authentication, not authorization. Server says "you're not authenticated".
// 403 Forbidden: it's for authorization. Server says "I know who you are,
//                but you just don’t have permission to access this resource".

// Get all users
exports.getUsers = (req, res) => {
  res.json(users);
};

// Create new access token from refresh token
exports.getToken = async (req, res) => {
  const refreshToken = req.body.refreshToken;

  // If token is not provided, send error message
  if (!refreshToken) {
    res.status(401).json({
      errors: [
        {
          msg: "Token not found",
        },
      ],
    });
  }

  // If token does not exist, send error message
  if (!refreshTokens.includes(refreshToken)) {
    res.status(403).json({
      errors: [
        {
          msg: "Invalid refresh token",
        },
      ],
    });
  }

  try {
    const user = await JWT.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    // user = { email: 'jame@gmail.com', iat: 1633586290, exp: 1633586350 }
    const { email } = user;
    const accessToken = await JWT.sign(
      { email },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "10s" }
    );
    res.json({ accessToken });
  } catch (error) {
    res.status(403).json({
      errors: [
        {
          msg: "Invalid token",
        },
      ],
    });
  }
};

// Deauthenticate - log out
// Delete refresh token
exports.logOut = (req, res) => {
  const refreshToken = req.body.refreshToken;

  refreshTokens = refreshTokens.filter((token) => token !== refreshToken);
  res.sendStatus(204);
};
