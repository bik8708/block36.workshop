const pg = require("pg");
const client = new pg.Client(
  process.env.DATABASE_URL || "postgres://localhost/acme_auth_store_db"
);
const uuid = require("uuid");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const secret = process.env.JWT || "shhh";

const createTables = async () => {
  const SQL = `
    DROP TABLE IF EXISTS favorites;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS products;
    CREATE TABLE users(
      id UUID PRIMARY KEY,
      username VARCHAR(20) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL
    );
    CREATE TABLE products(
      id UUID PRIMARY KEY,
      name VARCHAR(20)
    );
    CREATE TABLE favorites(
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id) NOT NULL,
      product_id UUID REFERENCES products(id) NOT NULL,
      CONSTRAINT unique_user_id_and_product_id UNIQUE (user_id, product_id)
    );
  `;
  await client.query(SQL);
};

const createUser = async ({ username, password }) => {
  console.log({ username, password });
  if (!username || !password) {
    throw new Error("Username and password are required");
  }

  console.log("Creating user with username:", username);
  console.log("Password before hashing:", password);

  const SQL = `
    INSERT INTO users(id, username, password) VALUES($1, $2, $3) RETURNING *
  `;
  const response = await client.query(SQL, [
    uuid.v4(),
    username,
    await bcrypt.hash(password, 5),
  ]);
  return response.rows[0];
};

const createProduct = async ({ name }) => {
  const SQL = `
    INSERT INTO products(id, name) VALUES($1, $2) RETURNING *
  `;
  const response = await client.query(SQL, [uuid.v4(), name]);
  return response.rows[0];
};

const createFavorite = async ({ user_id, product_id }) => {
  const SQL = `
    INSERT INTO favorites(id, user_id, product_id) VALUES($1, $2, $3) RETURNING *
  `;
  const response = await client.query(SQL, [uuid.v4(), user_id, product_id]);
  return response.rows[0];
};

const destroyFavorite = async ({ user_id, id }) => {
  const SQL = `
    DELETE FROM favorites WHERE user_id=$1 AND id=$2
  `;
  await client.query(SQL, [user_id, id]);
};

const authenticate = async ({ username, password }) => {
  const SQL = `
    SELECT id, username, password 
    FROM users 
    WHERE username=$1;
  `;
  const response = await client.query(SQL, [username]);
  if (
    !response.rows.length ||
    (await bcrypt.compare(password, response.rows[0].password)) === false
  ) {
    const error = Error("not authorized");
    error.status = 401;
    throw error;
  }
  const token = jwt.sign({ id: response.rows[0].id }, secret);
  return { token };
};

const findUserWithToken = async (token) => {
  console.log("TESTTOKEN", token);
  let id;
  try {
    const payload = jwt.verify(token, secret);
    console.log("PAYLOAD", payload);
    id = payload.id;
  } catch (err) {
    const error = Error("Not authorized", {
      cause: err,
    });
    error.status = 401;
    throw error;
  }

  const SQL = `
    SELECT id, username FROM users WHERE id=$1;
  `;
  const response = await client.query(SQL, [id]);
  if (!response.rows.length) {
    const error = Error("not Authorized");
    error.status = 401;
    throw error;
  }
  return response.rows[0];
};

const fetchUsers = async () => {
  const SQL = `
    SELECT id, username FROM users;
  `;
  const response = await client.query(SQL);
  return response.rows;
};

const fetchProducts = async () => {
  const SQL = `
    SELECT * FROM products;
  `;
  const response = await client.query(SQL);
  return response.rows;
};

const fetchFavorites = async (user_id) => {
  const SQL = `
    SELECT * FROM favorites where user_id = $1
  `;
  const response = await client.query(SQL, [user_id]);
  return response.rows;
};

const isLoggedIn = async (req, res, next) => {
  try {
    console.log("MIDDLEWARE RUNNING");
    console.log("Authorization Header:", req.headers.authorization);

    const token = req.headers.authorization;

    req.user = await findUserWithToken(token);

    console.log("AUTHENTICATED USER:", req.user);
    next();
  } catch (ex) {
    next(ex);
  }
};

module.exports = {
  client,
  createTables,
  createUser,
  createProduct,
  fetchUsers,
  fetchProducts,
  fetchFavorites,
  createFavorite,
  destroyFavorite,
  authenticate,
  findUserWithToken,
  isLoggedIn,
};
