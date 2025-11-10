exports.print = (data = null, printMsg = 'Data => ', stopScript = false) => {
    console.log('\n\n');
    console.log('=========== ✅ YOUR DATA PRINTED BELOW ✅ ===========');
    console.log(`${printMsg}`, data);
    console.log('=========== ✅ YOUR DATA PRINTED ENDS HERE ✅ ==========');
    console.log('\n\n');
    if (stopScript) return;
};
