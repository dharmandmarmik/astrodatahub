require('dotenv').config(); // Load environment variables
const SibApiV3Sdk = require('@getbrevo/brevo');

let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
let apiKey = apiInstance.authentications['apiKey'];

// Use the variable from the .env file
apiKey.apiKey = process.env.BREVO_API_KEY;

const sendOTP = async (email, otp) => {
    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.subject = "Verify Your AstroDataHub Account";
    sendSmtpEmail.htmlContent = `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #ffffff; padding: 40px; text-align: center;">
            <div style="max-width: 500px; margin: auto; background-color: #1e293b; padding: 20px; border-radius: 15px; border: 1px solid #334155;">
                <h1 style="color: #38bdf8; margin-bottom: 20px;">AstroDataHub</h1>
                <p style="font-size: 16px;">Your security authorization code is:</p>
                <div style="font-size: 42px; font-weight: bold; color: #38bdf8; letter-spacing: 12px; margin: 30px 0; padding: 20px; background: #0f172a; border-radius: 10px; border: 1px solid #38bdf8;">
                    ${otp}
                </div>
            </div>
        </div>`;
    
    sendSmtpEmail.sender = { "name": "AstroDataHub", "email": process.env.SENDER_EMAIL };
    sendSmtpEmail.to = [{ "email": email }];

    try {
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('✅ Brevo: Email sent successfully.');
    } catch (error) {
        console.error('❌ Brevo API Error:', error.message);
        throw error;
    }
};

module.exports = { sendOTP };