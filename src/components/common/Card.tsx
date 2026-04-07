import React from 'react';
import {Card as PaperCard} from 'react-native-paper';
import {StyleSheet} from 'react-native';

export const Card: React.FC<any> = ({style, ...props}) => {
  return <PaperCard style={[styles.card, style]} {...props} />;
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    marginHorizontal: 16,
    elevation: 2,
  },
});

