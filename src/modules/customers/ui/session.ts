const KEY = 'bt:customer';

/** id (WhatsApp normalizado) del cliente con sesión abierta en esta pestaña. */
export const getCustomerSession = (): string | undefined => {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
};
export const setCustomerSession = (id: string) => {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* sin almacenamiento: la sesión dura lo que dure la página */
  }
};
export const clearCustomerSession = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
};
