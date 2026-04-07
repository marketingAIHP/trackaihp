import React, {Component, ErrorInfo, ReactNode} from 'react';
import {View, StyleSheet} from 'react-native';
import {Text, Button, Card} from 'react-native-paper';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // In production, you might want to log to an error reporting service
    // Example: Sentry.captureException(error, {extra: errorInfo});
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Card style={styles.card}>
              <Card.Content style={styles.cardContent}>
                <Icon name="alert-circle" size={64} color="#d32f2f" />
                <Text variant="headlineSmall" style={styles.title}>
                  Something went wrong
                </Text>
                <Text variant="bodyMedium" style={styles.message}>
                  We're sorry, but something unexpected happened. Please try again.
                </Text>
                {__DEV__ && this.state.error && (
                  <View style={styles.errorDetails}>
                    <Text variant="bodySmall" style={styles.errorText}>
                      {this.state.error.toString()}
                    </Text>
                    {this.state.errorInfo && (
                      <Text variant="bodySmall" style={styles.errorText}>
                        {this.state.errorInfo.componentStack}
                      </Text>
                    )}
                  </View>
                )}
                <Button
                  mode="contained"
                  onPress={this.handleReset}
                  style={styles.button}>
                  Try Again
                </Button>
              </Card.Content>
            </Card>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
  },
  cardContent: {
    alignItems: 'center',
    padding: 24,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  message: {
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.7,
  },
  errorDetails: {
    width: '100%',
    marginBottom: 24,
    padding: 12,
    backgroundColor: '#ffebee',
    borderRadius: 4,
  },
  errorText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#c62828',
  },
  button: {
    marginTop: 8,
  },
});

