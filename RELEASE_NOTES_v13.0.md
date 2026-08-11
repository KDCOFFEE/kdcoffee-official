# KD Coffee Studio v13.0 Stable Commerce

## Stable foundation

This version starts from the v11.4 Order First Hero structure instead of stacking every previous patch.

## Commerce

- Half-pound and drip-bag variants
- Whole-bean and ground-coffee selection for half-pound products
- Quantity controls
- Add to cart
- Buy now and checkout
- Separate cart lines for variant and preparation
- Product Commerce fields continue to use the admin product data

## LINE Login

The login link sends the actual browser origin to the server and stores the exact callback base in the OAuth cookie. When the site is opened through ngrok, LINE receives the ngrok callback URL rather than localhost.

For local testing, LINE Developers must register the current public callback URL, such as:

https://YOUR-NGROK-DOMAIN.ngrok-free.dev/api/auth/line/callback

## Homepage

Default Hero:

不用先懂咖啡，
第一包就選到你真正喜歡的味道。

The Hero title, lead and primary button remain connected to the homepage admin data.
