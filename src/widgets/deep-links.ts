/** App scheme deep links opened from home-screen widgets. */
export const WIDGET_SCHEME = 'sezprint';

export const WIDGET_LINKS = {
  newLabel: `${WIDGET_SCHEME}://new-label`,
  pdf: `${WIDGET_SCHEME}://pdf`,
  shipping: `${WIDGET_SCHEME}://ecommerce-label`,
  excel: `${WIDGET_SCHEME}://excel-print`,
  serial: `${WIDGET_SCHEME}://new-label-setup?serialEditor=1`,
  amazon: `${WIDGET_SCHEME}://ecommerce-label?platform=amazon`,
  flipkart: `${WIDGET_SCHEME}://ecommerce-label?platform=flipkart`,
  meesho: `${WIDGET_SCHEME}://ecommerce-label?platform=meesho`,
} as const;
