const JWT = require("jsonwebtoken");
const Secret ='SecureOnlyPassword';

function createTokenForUser(user) {
  const payload = {
    AccNumber: user.accountNumber,
    customerName: user.customerName,
    AccountType: user.AccountType,
    customerPhone: user.customerPhone,
    customerEmail: user.customerEmail,
    customerAddress: user.customerAddress,
    customerCity: user.customerCity,
    role:user.role
  };

  return JWT.sign(payload, Secret, { expiresIn: "1h" });
}

module.exports = { createTokenForUser };
