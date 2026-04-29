const promisifyGrpc = (client, method) => {
  return (data) => {
    return new Promise((resolve, reject) => {
      client[method](data, (err, response) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  };
};

module.exports = promisifyGrpc;