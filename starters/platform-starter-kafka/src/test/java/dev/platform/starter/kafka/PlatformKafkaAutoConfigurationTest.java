package dev.platform.starter.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.kafka.KafkaProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class PlatformKafkaAutoConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(PlatformKafkaAutoConfiguration.class))
            .withBean(KafkaProperties.class, KafkaProperties::new)
            .withBean(ObjectMapper.class, ObjectMapper::new);

    @Test
    void publisherRequiresTheExplicitFlag() {
        contextRunner.run(context -> assertThat(context).doesNotHaveBean(EventPublisher.class));

        contextRunner
                .withPropertyValues("platform.kafka.enabled=true")
                .run(context -> assertThat(context).hasSingleBean(EventPublisher.class));
    }
}
