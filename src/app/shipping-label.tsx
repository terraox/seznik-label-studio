/**
 * Shipping Label WYSIWYG Editor Screen.
 * Renders shipping labels at true print size with full vector precision,
 * drag-and-drop repositioning, preset picker, PDF vector export, and direct thermal printing.
 */

import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { LabelEditor } from '@/components/shipping-editor/label-editor';
import {
  ShippingTemplate,
  STARTER_SHIPPING_TEMPLATES,
  TEMPLATE_STANDARD_4X6,
} from '@/lib/shipping-editor/types';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export default function ShippingLabelScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const [template, setTemplate] = useState<ShippingTemplate>(TEMPLATE_STANDARD_4X6);
  const [templateMenuVisible, setTemplateMenuVisible] = useState(false);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Navigation Header */}
      <View style={styles.header}>
        <Pressable
          hitSlop={12}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor={C.text} size={18} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Shipping Label Editor</Text>

        <Pressable
          onPress={() => setTemplateMenuVisible(true)}
          style={({ pressed }) => [styles.templateBtn, pressed && styles.pressed]}>
          <AppIcon name="square.grid.2x2" tintColor={C.link} size={16} />
          <Text style={styles.templateBtnText}>Templates</Text>
        </Pressable>
      </View>

      {/* Editor Surface */}
      <LabelEditor
        key={template.templateId}
        initialTemplate={template}
        onSaveTemplate={(t) => setTemplate(t)}
      />

      {/* Template Switcher Modal */}
      <Modal
        visible={templateMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTemplateMenuVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.backdrop} onPress={() => setTemplateMenuVisible(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choose Starter Template</Text>
              <Pressable onPress={() => setTemplateMenuVisible(false)} hitSlop={12}>
                <AppIcon name="xmark" tintColor={C.textSecondary} size={16} />
              </Pressable>
            </View>

            <ScrollView>
              {STARTER_SHIPPING_TEMPLATES.map((item) => {
                const isCurrent = item.templateId === template.templateId;
                return (
                  <Pressable
                    key={item.templateId}
                    onPress={() => {
                      setTemplate(JSON.parse(JSON.stringify(item)));
                      setTemplateMenuVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.templateOption,
                      isCurrent && styles.templateOptionActive,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.templateOptionLeft}>
                      <Text style={[styles.templateName, isCurrent && styles.templateNameActive]}>
                        {item.name}
                      </Text>
                      <Text style={styles.templateDetail}>
                        Size: {item.labelSize} · {item.fields.length} layout fields
                      </Text>
                    </View>
                    {isCurrent && (
                      <AppIcon name="checkmark.circle.fill" tintColor={C.link} size={20} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.hairline,
    backgroundColor: c.surface,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
  },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: c.accentSoft,
  },
  templateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: c.link,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: c.scrim,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    maxHeight: '65%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
  },
  templateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.hairline,
    marginBottom: 10,
    backgroundColor: c.fill,
  },
  templateOptionActive: {
    borderColor: c.link,
    backgroundColor: c.accentSoft,
  },
  templateOptionLeft: {
    flex: 1,
  },
  templateName: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
  },
  templateNameActive: {
    color: c.link,
  },
  templateDetail: {
    fontSize: 12,
    color: c.textSecondary,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.75,
  },
}));
