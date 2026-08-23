package dev.platform.starter.search;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class PlatformSearchAutoConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(PlatformSearchAutoConfiguration.class))
            .withBean(ElasticsearchOperations.class, () -> mock(ElasticsearchOperations.class));

    @Test
    void gatewayRequiresTheExplicitFlag() {
        contextRunner.run(context -> assertThat(context).doesNotHaveBean(SearchGateway.class));

        contextRunner
                .withPropertyValues("platform.search.enabled=true")
                .run(context -> assertThat(context).hasSingleBean(SearchGateway.class));
    }
}
