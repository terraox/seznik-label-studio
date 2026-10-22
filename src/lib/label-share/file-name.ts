/**
 * Label files end in .seznik (a .seznik.zip name, added by some apps when sending, is accepted too).
 * Files shared before the rename end in .sezlabel and still open.
 */
export const isLabelFileName = (name: string): boolean => /\.(seznik|sezlabel)(\.zip)?$/i.test(name.trim());
