const { defaultLogger, Log } = require('./src/index');

async function test() {
  console.log('Testing logging middleware...');
  
  // Test the main Log function
  const result = await Log('backend', 'error', 'handler', 'received string, expected bool');
  console.log('Result:', result);
}

test();
