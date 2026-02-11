const { decrypt } = require('@wecom/crypto');

const aesKey = 'uWbL5cea2greKh18Uqt8cIRBied4ev5dsB1O3WQxC1d=';
const suiteId = 'ww972d876dc8de53b4';
// Use the new payload from logs
const payload = 'SPfTx0fIuBrzuRiYnn1HfqxJMr0LMXM9cQXp9fIOfU3GIW3lB5NcdlHYfxCtc6C5dEArpSpo/iuuRVKBO7HDfViUJnE+x4QCQWAMVQ6vtjR1e7w0skENxZ5g4j';

try {
    const res = decrypt(aesKey, payload, suiteId);
    console.log('Decryption SUCCESS!');
    console.log('ID:', res.id);
    console.log('Message:', res.message.toString());
} catch (e) {
    console.log('Decryption Failed:', e.message);
    const resRaw = decrypt(aesKey, payload);
    console.log('Raw Message Hex:', resRaw.message.slice(0, 32).toString('hex'));
}
