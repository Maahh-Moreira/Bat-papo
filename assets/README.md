# Assets

Coloque suas imagens aqui e aponte os caminhos em:

`js/utils/assets.js` → objeto `ASSETS`

```js
export const ASSETS = {
  logo: '/assets/logo.png',      // sidebar, login
  mascot: '/assets/mascot.png',  // landing, empty states
  favicon: '/assets/icons/favicon.svg',
};
```

Enquanto for `null`, o sistema mostra um retângulo tracejado vazio (sem desenho gerado).
