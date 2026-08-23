package dev.platform.starter.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaOperations;
import org.springframework.kafka.support.SendResult;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletionException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KafkaEventPublisherTest {
    @Test
    void publishesJsonAndReturnsBrokerMetadata() throws Exception {
        @SuppressWarnings("unchecked")
        KafkaOperations<String, String> kafka = mock(KafkaOperations.class);
        @SuppressWarnings("unchecked")
        SendResult<String, String> sendResult = mock(SendResult.class);
        RecordMetadata metadata = mock(RecordMetadata.class);
        when(metadata.topic()).thenReturn("items");
        when(metadata.partition()).thenReturn(2);
        when(metadata.offset()).thenReturn(41L);
        when(sendResult.getRecordMetadata()).thenReturn(metadata);
        when(kafka.send(eq("items"), eq("item-1"), anyString()))
                .thenReturn(java.util.concurrent.CompletableFuture.completedFuture(sendResult));
        DomainEvent<Map<String, String>> event = new DomainEvent<>(
                UUID.fromString("f4d69f67-e293-4735-a691-12af9455eadd"),
                "item.created",
                1,
                Instant.parse("2026-08-20T00:00:00Z"),
                "catalog",
                "request-1",
                Map.of("name", "first")
        );

        EventPublishResult result = new KafkaEventPublisher(kafka, new ObjectMapper().findAndRegisterModules())
                .publish("items", "item-1", event)
                .toCompletableFuture()
                .join();

        assertThat(result).isEqualTo(new EventPublishResult("items", 2, 41L));
        verify(kafka).send(eq("items"), eq("item-1"), org.mockito.ArgumentMatchers.contains("item.created"));
    }

    @Test
    void serializationFailureDoesNotCallKafka() throws Exception {
        @SuppressWarnings("unchecked")
        KafkaOperations<String, String> kafka = mock(KafkaOperations.class);
        ObjectMapper objectMapper = mock(ObjectMapper.class);
        when(objectMapper.writeValueAsString(org.mockito.ArgumentMatchers.any()))
                .thenThrow(new JsonProcessingException("cannot serialize") { });
        DomainEvent<String> event = new DomainEvent<>(
                UUID.randomUUID(), "broken", 1, Instant.EPOCH, "test", "request-1", "payload"
        );

        assertThatThrownBy(() -> new KafkaEventPublisher(kafka, objectMapper)
                .publish("items", "item-1", event)
                .toCompletableFuture()
                .join())
                .isInstanceOf(CompletionException.class)
                .hasCauseInstanceOf(JsonProcessingException.class);
        verify(kafka, org.mockito.Mockito.never()).send(anyString(), anyString(), anyString());
    }
}
