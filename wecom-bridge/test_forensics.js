const { decrypt, getSignature } = require('@wecom/crypto');

const token = 'xytcloud_token';
const aesKey = 'uWbL5cea2greKh18Uqt8cIRBied4ev5dsB1O3WQxC1d=';
const suiteId = 'ww972d876dc8de53b4';

const timestamp = '1770581438';
const nonce = '1770848052';
const msg_signature = 'ff3d1e9c8af784ec42314e63f5c3eb467232cd1b';
const encryptMsg = 'JyKrWDXjBNSFRwRoV9gEN4fiBgOEnJXwXPxUU2+R0L+DtYlrXG8wf9u7NC57q4wmfN9xIg6csgGywAUhNAU6dxhAVzxoMePqgJUzW0DxrQ+AystlMxKcfGOzOS1nhp3URo5BHAwHc1HzRUENHBy8uG9GOAuViANggeHEvh3E9JjB5iqGscXW3gAYWzaOzG9j2c1cIwq2Po6GEGPlINwfLek+l7dnzGye3C8/HO7D6t0430Ouv3imefu0/hm3d02TouLbDbaiBLcZ/myoXefD8Ei43UF4yYjfSq2LrVifmuDB05XB68qhKuvc7sUnjgCOkYMvlKhzEaRZW9iVRfJ/OFYo6BW1PoM1/nBDohZk1lMT3YpdDGkslJ7mpB05n4hr';

console.log('--- Signature Check ---');
const expectedSignature = getSignature(token, timestamp, nonce, encryptMsg);
console.log('Expected:', expectedSignature);
console.log('Got:     ', msg_signature);

if (expectedSignature === msg_signature) {
    console.log('Signature MATCH!');
} else {
    console.log('Signature MISMATCH!');
}

console.log('\n--- Decryption Check ---');
try {
    const res = decrypt(aesKey, encryptMsg, suiteId);
    console.log('Decryption SUCCESS!');
    console.log('ID:', res.id);
    console.log('Message:', res.message.toString());
} catch (e) {
    console.log('Decryption FAILED:', e.message);
    if (e.stack) console.log(e.stack);
}
