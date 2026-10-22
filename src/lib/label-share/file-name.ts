/** Label files end in .sezlabel (a .sezlabel.zip name, added by some apps when sending, is accepted too). */
export const isLabelFileName = (name: string): boolean => /\.sezlabel(\.zip)?$/i.test(name.trim());
