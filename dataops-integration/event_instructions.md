<div style="font-family:Lato,Arial,sans-serif;background:#11567F;color:#FFFFFF;border-radius:14px;padding:28px 32px;margin:0 0 28px 0;">
  <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#71D3DC;font-weight:700;">Hands-on lab</div>
  <div style="font-size:28px;font-weight:700;line-height:1.25;margin-top:6px;">Welcome. Today you'll build banking data products end to end in Snowflake.</div>
  <div style="font-size:16px;line-height:1.6;margin-top:12px;color:#E6F4FA;">Your own Snowflake account is ready, with the lab data and your guide set up for you. Everything you need is on this page.</div>
</div>

## Before you start

<ul style="font-family:Lato,Arial,sans-serif;color:#1E252B;font-size:16px;line-height:1.8;margin:8px 0 24px 0;">
  <li>You'll use <b>two windows</b>: the <b>Lab Companion</b> (your guide) and <b>Snowflake</b> (where you build).</li>
  <li>Each button below opens in its own tab. Drag one into a new window so you can see both side by side.</li>
  <li>The same login works for both.</li>
  <li>The first time you sign in to Snowflake, you'll be asked to <b>choose a new password</b>. Keep it: the password below only works once.</li>
</ul>

## Your login

<div style="font-family:Lato,Arial,sans-serif;border:1px solid #D9EEF7;border-left:6px solid #29B5E8;border-radius:10px;padding:16px 20px;margin:8px 0 28px 0;background:#F5FBFE;">
  <div style="display:flex;gap:16px;padding:6px 0;font-size:16px;"><span style="width:140px;color:#5B5B5B;font-weight:700;">Username</span><span style="color:#000000;font-family:Menlo,Consolas,monospace;">{{vars.SNOWFLAKE_USER}}</span></div>
  <div style="display:flex;gap:16px;padding:6px 0;font-size:16px;"><span style="width:140px;color:#5B5B5B;font-weight:700;">Password</span><span style="color:#000000;font-family:Menlo,Consolas,monospace;">{{vars.SNOWFLAKE_PASSWORD}}</span></div>
  <div style="display:flex;gap:16px;padding:6px 0;font-size:16px;"><span style="width:140px;color:#5B5B5B;font-weight:700;">Snowflake URL</span><a style="color:#11567F;" href="https://{{vars.DATAOPS_SNOWFLAKE_ACCOUNT}}.snowflakecomputing.com" target="snowflake" rel="noopener noreferrer">https://{{vars.DATAOPS_SNOWFLAKE_ACCOUNT}}.snowflakecomputing.com</a></div>
</div>

## Open both windows

<div style="display:flex;flex-wrap:wrap;gap:24px;margin:12px 0 28px 0;">
<a href="{{vars.LAB_COMPANION_URL}}" target="lab_companion" rel="noopener noreferrer">
  <svg xmlns="http://www.w3.org/2000/svg" width="260" height="56">
    <rect x="0" y="0" width="260" height="56" rx="28" ry="28" fill="#11567F" />
    <text x="130" y="35" font-family="Lato, Arial, sans-serif" font-size="17" font-weight="700" fill="#FFFFFF" text-anchor="middle">1. Open Lab Companion</text>
  </svg>
</a>
<a href="https://{{vars.DATAOPS_SNOWFLAKE_ACCOUNT}}.snowflakecomputing.com" target="snowflake" rel="noopener noreferrer">
  <svg xmlns="http://www.w3.org/2000/svg" width="260" height="56">
    <rect x="0" y="0" width="260" height="56" rx="28" ry="28" fill="#29B5E8" />
    <text x="130" y="35" font-family="Lato, Arial, sans-serif" font-size="17" font-weight="700" fill="#FFFFFF" text-anchor="middle">2. Open Snowflake</text>
  </svg>
</a>
</div>

## Then

<ol style="font-family:Lato,Arial,sans-serif;color:#1E252B;font-size:16px;line-height:1.8;margin:8px 0 24px 0;">
  <li><b>In the Lab Companion</b>
    <ul>
      <li>Sign in with the login above.</li>
      <li>Choose your pathway and follow the steps.</li>
      <li>Press <b>Check my work</b> at the end of each module.</li>
    </ul>
  </li>
  <li style="margin-top:10px;"><b>In Snowflake</b>
    <ul>
      <li>Sign in with the same login.</li>
      <li>Your role and warehouse are already set up for you.</li>
      <li>The Lab Companion shows you where to go in Snowflake at each step.</li>
    </ul>
  </li>
</ol>

<div style="font-family:Lato,Arial,sans-serif;border-radius:10px;padding:14px 20px;background:#EAF8FB;border:1px solid #71D3DC;font-size:15px;line-height:1.6;color:#11567F;">
  <b>Tip:</b> if the Lab Companion says <b>Setting up your lab</b>, your account is still loading its data. Leave it open: it opens the lab by itself when it's ready.
</div>
