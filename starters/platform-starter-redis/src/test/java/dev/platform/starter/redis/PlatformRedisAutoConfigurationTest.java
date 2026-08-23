package dev.platform.starter.redis;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class PlatformRedisAutoConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(PlatformRedisAutoConfiguration.class))
            .withBean(StringRedisTemplate.class, () -> mock(StringRedisTemplate.class))
            .withBean(ObjectMapper.class, ObjectMapper::new);

    @Test
    void cacheBeanRequiresTheExplicitFlag() {
        contextRunner.run(context -> assertThat(context).doesNotHaveBean(JsonCache.class));

        contextRunner
                .withPropertyValues("platform.redis.enabled=true")
                .run(context -> assertThat(context).hasSingleBean(JsonCache.class));
    }
}
